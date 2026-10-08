/**
 * Liest die vom backup.sh-Skript erzeugten Dateien aus BACKUP_PATH (read-only
 * in den Container gemountet, siehe docker-compose.yml) und gruppiert sie zu
 * Sätzen (db_<ts> + storage_<ts>). Gemeinsam genutzt von der Einstellungen-
 * Übersicht (routes/einstellungen.ts) und der wöchentlichen Status-Mail
 * (workers/backup.worker.ts), damit beide exakt dieselbe Sicht zeigen.
 */

import fs from "node:fs/promises";
import path from "node:path";

const BACKUP_PATH = process.env.BACKUP_PATH ?? "/data/backups";
const BACKUP_DATEI_REGEX = /^(db|storage)_(\d{8}_\d{6})\.(?:sql\.gz|tar\.gz)(\.enc)?$/;

export interface BackupSatz {
  zeitpunkt: Date;
  groesseBytes: number;
  vollstaendig: boolean;
  verschluesselt: boolean;
}

export interface BackupUebersicht {
  pfadLesbar: boolean;
  saetze: BackupSatz[];
}

export async function ermittleBackupSaetze(): Promise<BackupUebersicht> {
  try {
    const dateinamen = await fs.readdir(BACKUP_PATH);
    const saetze = new Map<string, { zeitpunkt: Date; groesseBytes: number; hatDb: boolean; hatStorage: boolean; unverschluesselt: boolean }>();

    for (const name of dateinamen) {
      const treffer = name.match(BACKUP_DATEI_REGEX);
      if (!treffer) continue;
      const [, art, ts, enc] = treffer;
      const zeitpunkt = new Date(
        `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`
      );
      const { size } = await fs.stat(path.join(BACKUP_PATH, name));

      const eintrag = saetze.get(ts) ?? { zeitpunkt, groesseBytes: 0, hatDb: false, hatStorage: false, unverschluesselt: false };
      if (!enc) eintrag.unverschluesselt = true;
      eintrag.groesseBytes += size;
      if (art === "db") eintrag.hatDb = true;
      if (art === "storage") eintrag.hatStorage = true;
      saetze.set(ts, eintrag);
    }

    const liste = [...saetze.values()]
      .sort((a, b) => b.zeitpunkt.getTime() - a.zeitpunkt.getTime())
      .map(s => ({
        zeitpunkt:      s.zeitpunkt,
        groesseBytes:   s.groesseBytes,
        vollstaendig:   s.hatDb && s.hatStorage,
        verschluesselt: !s.unverschluesselt,
      }));

    return { pfadLesbar: true, saetze: liste };
  } catch {
    // Ordner nicht gemountet/lesbar (z.B. vor dem ersten Deploy mit dem neuen Volume) – kein harter Fehler
    return { pfadLesbar: false, saetze: [] };
  }
}
