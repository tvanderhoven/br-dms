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
/** info_<ts>.txt: Version und Commit des Systems beim Backup (seit 1.3.1, siehe backup.sh) */
const INFO_DATEI_REGEX = /^info_(\d{8}_\d{6})\.txt$/;

export interface BackupSatz {
  zeitpunkt: Date;
  groesseBytes: number;
  vollstaendig: boolean;
  verschluesselt: boolean;
  version: string | null;
  commit: string | null;
}

export interface BackupUebersicht {
  pfadLesbar: boolean;
  saetze: BackupSatz[];
}

export async function ermittleBackupSaetze(): Promise<BackupUebersicht> {
  try {
    const dateinamen = await fs.readdir(BACKUP_PATH);
    const saetze = new Map<string, { zeitpunkt: Date; groesseBytes: number; hatDb: boolean; hatStorage: boolean; unverschluesselt: boolean }>();
    const infos = new Map<string, { version: string | null; commit: string | null }>();

    for (const name of dateinamen) {
      const info = name.match(INFO_DATEI_REGEX);
      if (info) {
        const text = await fs.readFile(path.join(BACKUP_PATH, name), "utf8").catch(() => "");
        const wert = (schluessel: string) => text.match(new RegExp(`^${schluessel}=(.+)$`, "m"))?.[1].trim() || null;
        infos.set(info[1], { version: wert("version"), commit: wert("commit") });
        continue;
      }
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

    const liste = [...saetze.entries()]
      .sort(([, a], [, b]) => b.zeitpunkt.getTime() - a.zeitpunkt.getTime())
      .map(([ts, s]) => ({
        zeitpunkt:      s.zeitpunkt,
        groesseBytes:   s.groesseBytes,
        vollstaendig:   s.hatDb && s.hatStorage,
        verschluesselt: !s.unverschluesselt,
        version:        infos.get(ts)?.version ?? null,
        commit:         infos.get(ts)?.commit ?? null,
      }));

    return { pfadLesbar: true, saetze: liste };
  } catch {
    // Ordner nicht gemountet/lesbar (z.B. vor dem ersten Deploy mit dem neuen Volume) – kein harter Fehler
    return { pfadLesbar: false, saetze: [] };
  }
}
