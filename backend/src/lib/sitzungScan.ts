/**
 * Gemeinsame Logik für Sitzungs-Scans (Anwesenheitsliste/Protokoll-Unterschriften) –
 * genutzt vom direkten Browser-Upload (routes/sitzungScans.ts) und vom Zuordnen-Schritt
 * für Scans aus dem Watch-Folder (routes/scanEingang.ts).
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AuditAktion, SitzungScanTyp, SitzungStatus } from "@prisma/client";
import prisma from "./prisma.js";
import { encryptFile, secureDelete } from "./encryption.js";

export const STORAGE_SITZUNG_SCANS = process.env.STORAGE_PATH ?? "/data/storage";
export const MASTER_KEY = process.env.ENCRYPTION_KEY!;
export const REL_PFAD_SITZUNG_SCANS = "sitzung-scans";

/** Gleiche Regel wie auf der Sitzungsseite: eine fixierte Tagesordnung ist eingefroren. */
export function scanStatusFehler(status: SitzungStatus, typ: SitzungScanTyp): string | null {
  if (typ === SitzungScanTyp.ANWESENHEITSLISTE
      && (status === SitzungStatus.ENTWURF || status === SitzungStatus.ABGESAGT || status === SitzungStatus.ABGESCHLOSSEN)) {
    return "Anwesenheitsliste erst ab fixierter Tagesordnung hochladbar, nicht mehr nach Abschluss";
  }
  if (typ === SitzungScanTyp.PROTOKOLL_UNTERSCHRIFTEN && status !== SitzungStatus.PROTOKOLL_FINAL) {
    return "Protokoll-Unterschriften erst nach Finalisierung hochladbar";
  }
  return null;
}

/**
 * Legt einen Scan für (sitzungId, typ) an oder ersetzt den bestehenden – verschlüsselt die
 * Quelldatei, ersetzt eine vorhandene verschlüsselte Datei und schreibt den Audit-Log-Eintrag.
 * Ruft `scanStatusFehler` NICHT selbst auf – Aufrufer prüft das vorher (ggf. für mehrere `typ`
 * auf einmal, damit bei "eine Datei für beide" entweder alles oder nichts geschrieben wird).
 */
export async function speichereSitzungScan(opts: {
  sitzungId:  string;
  typ:        SitzungScanTyp;
  quellPfad:  string;
  dateiname:  string;
  mimeTyp:    string;
  benutzerId: string;
}): Promise<void> {
  const { sitzungId, typ, quellPfad, dateiname, mimeTyp, benutzerId } = opts;

  const bisherige = await prisma.sitzungScan.findUnique({
    where: { sitzungId_typ: { sitzungId, typ } },
  });

  const scanId  = randomUUID();
  const encName = `${scanId}.enc`;
  const encPfad = path.join(STORAGE_SITZUNG_SCANS, REL_PFAD_SITZUNG_SCANS, encName);
  await fs.mkdir(path.join(STORAGE_SITZUNG_SCANS, REL_PFAD_SITZUNG_SCANS), { recursive: true });

  const { checksum } = await encryptFile({
    sourcePath: quellPfad,
    destPath:   encPfad,
    masterKey:  MASTER_KEY,
    documentId: scanId,
  });

  const stat = await fs.stat(quellPfad);

  await prisma.sitzungScan.upsert({
    where:  { sitzungId_typ: { sitzungId, typ } },
    create: {
      id: scanId,
      sitzungId,
      typ,
      dateiname,
      speicherpfad:     REL_PFAD_SITZUNG_SCANS,
      verschlPfad:      encName,
      dateigroesse:     stat.size,
      mimeTyp,
      pruefsumme:       checksum,
      hochgeladenVonId: benutzerId,
    },
    update: {
      dateiname,
      speicherpfad:     REL_PFAD_SITZUNG_SCANS,
      verschlPfad:      encName,
      dateigroesse:     stat.size,
      mimeTyp,
      pruefsumme:       checksum,
      hochgeladenVonId: benutzerId,
      hochgeladenAm:    new Date(),
    },
  });

  if (bisherige) {
    await secureDelete(path.join(STORAGE_SITZUNG_SCANS, bisherige.speicherpfad, bisherige.verschlPfad)).catch(() => {});
  }

  await prisma.auditLog.create({
    data: {
      sitzungId,
      benutzerId,
      aktion:  AuditAktion.SITZUNG_SCAN_HOCHGELADEN,
      details: { typ, dateiname },
    },
  }).catch(() => {});
}
