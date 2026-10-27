/**
 * Multipart-Upload unabhängig von der Reihenfolge der Felder lesen.
 *
 * request.file() liefert in `fields` nur die Felder, die VOR der Datei im Request stehen –
 * kommen Titel & Co. erst danach, fehlen sie (Issue #30). Hier werden alle Teile gelesen; die
 * Datei landet zuerst in einer temporären Datei, damit die Felder dahinter noch ankommen.
 */

import type { FastifyRequest } from "fastify";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface MultipartInhalt {
  /** Erste Datei im Request, null wenn keine übermittelt wurde */
  datei:  { pfad: string; filename: string; mimetype: string; abgeschnitten: boolean } | null;
  felder: Record<string, string>;
  /** Temporäre Datei löschen – nach der Verarbeitung immer aufrufen */
  aufraeumen: () => Promise<void>;
}

export async function multipartLesen(request: FastifyRequest, tmpVerzeichnis: string): Promise<MultipartInhalt> {
  const felder: Record<string, string> = {};
  let datei: MultipartInhalt["datei"] = null;
  const aufraeumen = async () => { if (datei) await fs.unlink(datei.pfad).catch(() => {}); };

  await fs.mkdir(tmpVerzeichnis, { recursive: true });
  try {
    for await (const teil of request.parts()) {
      if (teil.type === "field") {
        if (typeof teil.value === "string") felder[teil.fieldname] = teil.value;
      } else if (!datei) {
        const pfad = path.join(tmpVerzeichnis, `${randomUUID()}.upload`);
        datei = { pfad, filename: teil.filename, mimetype: teil.mimetype, abgeschnitten: false };
        await pipeline(teil.file, createWriteStream(pfad));
        datei.abgeschnitten = teil.file.truncated;
      } else {
        teil.file.resume(); // weitere Dateien werden ignoriert
      }
    }
  } catch (err) {
    await aufraeumen();
    throw err;
  }
  return { datei, felder, aufraeumen };
}
