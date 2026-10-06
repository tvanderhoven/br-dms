import { watch as chokidarWatch } from "chokidar";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { Kategorie, AuditAktion } from "@prisma/client";
import { verarbeiteDokument } from "./dokument-pipeline.service.js";
import { encryptFile } from "../lib/encryption.js";
import prisma from "../lib/prisma.js";

const WATCH_PATH  = process.env.WATCH_FOLDER   ?? "/uploads/watch_inbox";
const SYSTEM_USER = process.env.SYSTEM_USER_ID ?? "";
const ERLAUBTE_EXTS = new Set([".pdf", ".docx", ".docm", ".xlsx"]);

const STORAGE    = process.env.STORAGE_PATH ?? "/data/storage";
const MASTER_KEY = process.env.ENCRYPTION_KEY!;

// Unterordner für Scans (Anwesenheitsliste/Protokoll-Unterschriften, Paket 4) – landet NICHT
// als Dokument, sondern in ScanEingang zur Zuordnung im Eingang (siehe routes/scanEingang.ts).
const SCAN_EINGANG_ORDNER = "protokoll_scan";
const ERLAUBTE_SCAN_EXTS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const SCAN_MIME: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
};

interface OrdnerEinstufung {
  kategorie: Kategorie;
  // Nur relevant bei ANHOERUNG_102 – ohne Angabe werden sicherheitshalber
  // beide Fristen (7 + 3 Tage) angelegt, siehe dokument-pipeline.service.ts
  kuendigungsArt?: "ORDENTLICH" | "AUSSERORDENTLICH";
}

const ORDNER_KATEGORIE: Record<string, OrdnerEinstufung> = {
  anhoerung_99:                   { kategorie: Kategorie.ANHOERUNG_99 },
  anhoerung_102:                  { kategorie: Kategorie.ANHOERUNG_102, kuendigungsArt: "ORDENTLICH" },
  anhoerung_102_ausserordentlich: { kategorie: Kategorie.ANHOERUNG_102, kuendigungsArt: "AUSSERORDENTLICH" },
  betriebsvereinbarung:           { kategorie: Kategorie.BETRIEBSVEREINBARUNG },
  protokoll:                      { kategorie: Kategorie.PROTOKOLL },
  bewerbung:                      { kategorie: Kategorie.BEWERBUNG },
  bewerbung_alternativ:           { kategorie: Kategorie.BEWERBUNG_ALTERNATIV },
  zeitmodell_87:                  { kategorie: Kategorie.ZEITMODELL_87 },
  abmahnung:                      { kategorie: Kategorie.ABMAHNUNG },
  arbeitgeber_info:               { kategorie: Kategorie.ARBEITGEBER_INFO },
  arbeitsschutz:                  { kategorie: Kategorie.ARBEITSSCHUTZ },
  schriftverkehr:                 { kategorie: Kategorie.SCHRIFTVERKEHR },
  sonstiges:                      { kategorie: Kategorie.SONSTIGES },
};

// Unterordner die nicht importiert werden dürfen
const IGNORIERTE_ORDNER = new Set(["fehler"]);

const MIME: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".docm": "application/vnd.ms-word.document.macroEnabled.12",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function logFehler(dateiname: string, fehler: unknown): Promise<void> {
  await prisma.auditLog.create({
    data: {
      benutzerId: SYSTEM_USER || null,
      aktion:     AuditAktion.WATCHFOLDER_FEHLER,
      details:    { dateiname, fehler: String(fehler) },
    },
  }).catch((dbErr) => {
    console.error("[watchfolder] DB-Fehler beim Fehler-Logging:", dbErr);
  });
}

async function verschiebeInFehlerOrdner(filePath: string, dateiname: string): Promise<void> {
  const fehlerPfad = path.join(WATCH_PATH, "fehler");
  await fs.mkdir(fehlerPfad, { recursive: true }).catch(() => {});
  const ziel = path.join(fehlerPfad, dateiname);
  await fs.rename(filePath, ziel).catch((err) => {
    console.error(`[watchfolder] Konnte Datei nicht nach fehler/ verschieben: ${err}`);
  });
}

export function starteWatchFolder(): void {
  if (!SYSTEM_USER) {
    console.warn("[watchfolder] SYSTEM_USER_ID nicht gesetzt – WatchFolder deaktiviert");
    return;
  }

  console.log(`[watchfolder] Überwache ${WATCH_PATH}`);

  // Sequentielle Queue – immer nur eine Datei gleichzeitig verarbeiten (OOM-Schutz)
  let queue = Promise.resolve();

  const verarbeiteEinzeln = (filePath: string) => {
    queue = queue.then(async () => {
      const ext        = path.extname(filePath).toLowerCase();
      const dateiname  = path.basename(filePath);
      const unterordner = path.basename(path.dirname(filePath)).toLowerCase();

      if (IGNORIERTE_ORDNER.has(unterordner)) return;

      if (unterordner === SCAN_EINGANG_ORDNER) {
        if (!ERLAUBTE_SCAN_EXTS.has(ext)) return;
        console.log(`[watchfolder] Scan-Eingang: ${dateiname}`);
        try {
          const scanId  = randomUUID();
          const relPfad = "scan-eingang";
          const encName = `${scanId}.enc`;
          await fs.mkdir(path.join(STORAGE, relPfad), { recursive: true });

          const stat = await fs.stat(filePath);
          const { checksum } = await encryptFile({
            sourcePath: filePath,
            destPath:   path.join(STORAGE, relPfad, encName),
            masterKey:  MASTER_KEY,
            documentId: scanId,
          });

          await prisma.scanEingang.create({
            data: {
              id:           scanId,
              dateiname,
              speicherpfad: relPfad,
              verschlPfad:  encName,
              dateigroesse: stat.size,
              mimeTyp:      SCAN_MIME[ext]!,
              pruefsumme:   checksum,
            },
          });

          await fs.unlink(filePath);
          console.log(`[watchfolder] ✓ ${dateiname} als Scan-Eingang übernommen`);
        } catch (err) {
          console.error(`[watchfolder] Fehler bei Scan-Eingang ${dateiname}:`, err);
          await logFehler(dateiname, err);
          await verschiebeInFehlerOrdner(filePath, dateiname);
        }
        return;
      }

      if (!ERLAUBTE_EXTS.has(ext)) return;

      const einstufung = ORDNER_KATEGORIE[unterordner] ?? { kategorie: Kategorie.SONSTIGES };
      const mimetype   = MIME[ext]!;

      console.log(`[watchfolder] Verarbeite: ${dateiname} (${einstufung.kategorie}${einstufung.kuendigungsArt ? `/${einstufung.kuendigungsArt}` : ""})`);

      try {
        await verarbeiteDokument({
          stream:            createReadStream(filePath) as any,
          originalDateiname: dateiname,
          mimetype,
          userId:            SYSTEM_USER,
          metadata:          {
            kategorie:      einstufung.kategorie,
            kuendigungsArt: einstufung.kuendigungsArt,
            inboxQuelle:    "WATCHFOLDER",
          },
        });

        await fs.unlink(filePath);
        console.log(`[watchfolder] ✓ ${dateiname} importiert`);
      } catch (err) {
        console.error(`[watchfolder] Fehler bei ${dateiname}:`, err);
        await logFehler(dateiname, err);
        await verschiebeInFehlerOrdner(filePath, dateiname);
      }
    }).catch((err: unknown) => {
      console.error("[watchfolder] Queue-Fehler:", err);
    });
  };

  try {
    const watcher = chokidarWatch(WATCH_PATH, {
      usePolling:       true,
      interval:         3000,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
      ignoreInitial:    false, // Dateien die beim Start im Ordner liegen werden verarbeitet
      depth:            1,
    });

    watcher.on("add", verarbeiteEinzeln);

    watcher.on("error", (err: unknown) => {
      console.error("[watchfolder] Watcher-Fehler:", err);
    });
  } catch (err) {
    console.error("[watchfolder] Konnte Watcher nicht starten:", err);
  }
}
