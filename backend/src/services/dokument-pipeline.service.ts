import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Readable } from "node:stream";
import { Kategorie, AuditAktion } from "@prisma/client";
import { encryptFile } from "../lib/encryption.js";
import prisma from "../lib/prisma.js";
import { STANDARD_AUFBEWAHRUNG_TAGE } from "../lib/kategorien.js";

const execFileAsync = promisify(execFile);

const STORAGE = process.env.STORAGE_PATH ?? "/data/storage";
const MASTER_KEY = process.env.ENCRYPTION_KEY!;


export interface PipelineOptionen {
  stream: Readable;
  originalDateiname: string;
  mimetype: string;
  userId: string;
  ip?: string;
  userAgent?: string;
  metadata?: {
    titel?: string;
    kategorie?: Kategorie;
    aktenzeichen?: string;
    vertraulich?: boolean;
    inboxQuelle?: string;
    ordnerId?: string;
    // Nur relevant bei kategorie=ANHOERUNG_102: legt fest, welche der beiden
    // Fristen erzeugt wird (7 Tage ordentlich vs. 3 Tage außerordentlich).
    // Ohne Angabe werden sicherheitshalber beide angelegt (z.B. Watchfolder).
    kuendigungsArt?: "ORDENTLICH" | "AUSSERORDENTLICH";
  };
}

export async function verarbeiteDokument(opts: PipelineOptionen) {
  const {
    stream,
    originalDateiname,
    mimetype,
    userId,
    ip,
    userAgent,
    metadata = {},
  } = opts;

  const kategorie = metadata.kategorie ?? Kategorie.SONSTIGES;
  const titel = metadata.titel ?? path.basename(originalDateiname, path.extname(originalDateiname)).replace(/[_-]+/g, " ").trim();

  const docId   = randomUUID();
  const tmpPfad = path.join(STORAGE, "tmp", `${docId}.tmp`);
  const relPfad = kategorie.toLowerCase();
  const encName = `${docId}.enc`;
  const encPfad = path.join(STORAGE, relPfad, encName);

  await fs.mkdir(path.join(STORAGE, "tmp"), { recursive: true });
  await fs.mkdir(path.join(STORAGE, relPfad), { recursive: true });

  await pipeline(stream, createWriteStream(tmpPfad)).catch(async (err) => {
    await fs.unlink(tmpPfad).catch(() => {});
    throw err;
  });

  const stat = await fs.stat(tmpPfad);

  let textinhalt: string | null = null;
  if (mimetype === "application/pdf") {
    try {
      const { stdout } = await execFileAsync("pdftotext", [tmpPfad, "-"], {
        maxBuffer: 10 * 1024 * 1024,
        timeout:   15_000,
      });
      const text = stdout.trim();
      if (text.length > 0) textinhalt = text.slice(0, 100_000);
    } catch {
      // pdftotext nicht verfügbar oder Datei nicht lesbar – kein Volltext
    }
  }

  const { checksum } = await encryptFile({
    sourcePath: tmpPfad,
    destPath:   encPfad,
    masterKey:  MASTER_KEY,
    documentId: docId,
  }).catch(async (err) => {
    await fs.unlink(tmpPfad).catch(() => {});
    throw err;
  });

  await fs.unlink(tmpPfad);

  const regel = await prisma.aufbewahrungsregel.findUnique({ where: { kategorie } });
  const aufbewahrungTage = regel?.tage ?? STANDARD_AUFBEWAHRUNG_TAGE[kategorie];
  const deleteAt = new Date();
  deleteAt.setDate(deleteAt.getDate() + aufbewahrungTage);

  const dokument = await prisma.dokument.create({
    data: {
      id:              docId,
      titel,
      kategorie,
      dateiname:       originalDateiname,
      speicherpfad:    relPfad,
      verschlPfad:     encName,
      dateigroesse:    stat.size,
      mimeTyp:         mimetype,
      pruefsumme:      checksum,
      aktenzeichen:    metadata.aktenzeichen ?? null,
      vertraulich:     metadata.vertraulich ?? false,
      ordnerId:        metadata.ordnerId ?? null,
      inboxQuelle:     metadata.inboxQuelle ?? "UPLOAD",
      inboxGelesen:    false,
      textinhalt,
      deleteAt,
      hochgeladenVonId: userId,
    },
  });

  await fristenAnlegen(docId, kategorie, metadata.kuendigungsArt);

  if (kategorie === Kategorie.ANHOERUNG_99 || kategorie === Kategorie.ANHOERUNG_102) {
    await prisma.anhoerungsVorgang.create({
      data: {
        dokumentId: docId,
        kuendigungsArt: kategorie === Kategorie.ANHOERUNG_102 ? (metadata.kuendigungsArt ?? null) : null,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      benutzerId: userId,
      dokumentId: docId,
      aktion:     AuditAktion.DOKUMENT_ERSTELLT,
      ip:         ip ?? null,
      userAgent:  userAgent ?? null,
      details:    {
        kategorie,
        dateiname: originalDateiname,
        groesse:   stat.size,
        quelle:    metadata.inboxQuelle ?? "UPLOAD",
      },
    },
  });

  if (metadata.inboxQuelle === "WATCHFOLDER") {
    await prisma.auditLog.create({
      data: {
        benutzerId: userId,
        dokumentId: docId,
        aktion:     AuditAktion.WATCHFOLDER_DATEI_EMPFANGEN,
        details:    { dateiname: originalDateiname },
      },
    });
  }

  return dokument;
}

async function fristenAnlegen(
  dokumentId: string,
  kategorie: Kategorie,
  kuendigungsArt?: "ORDENTLICH" | "AUSSERORDENTLICH",
): Promise<void> {
  const jetzt = new Date();
  const fristen: Array<{ typ: string; tage: number }> = [];

  if (kategorie === Kategorie.ANHOERUNG_99) {
    fristen.push({ typ: "ANHOERUNG_99_WOCHE", tage: 7 });
    fristen.push({ typ: "WIDERSPRUCH", tage: 7 });
  }
  if (kategorie === Kategorie.ANHOERUNG_102) {
    if (kuendigungsArt === "AUSSERORDENTLICH") {
      fristen.push({ typ: "ANHOERUNG_102_AUSSERORDENTLICH", tage: 3 });
    } else if (kuendigungsArt === "ORDENTLICH") {
      fristen.push({ typ: "ANHOERUNG_102_ORDENTLICH", tage: 7 });
    } else {
      // Keine Angabe (z.B. automatischer Watchfolder-Import ohne manuelle
      // Klassifizierung) – sicherheitshalber beide Fristen anlegen.
      fristen.push({ typ: "ANHOERUNG_102_ORDENTLICH", tage: 7 });
      fristen.push({ typ: "ANHOERUNG_102_AUSSERORDENTLICH", tage: 3 });
    }
  }
  if (kategorie === Kategorie.ZEITMODELL_87) {
    fristen.push({ typ: "ZEITMODELL_87_WOCHE", tage: 7 });
  }

  for (const f of fristen) {
    const faelligAm = new Date(jetzt);
    faelligAm.setDate(faelligAm.getDate() + f.tage);
    await prisma.frist.create({ data: { dokumentId, typ: f.typ as any, faelligAm } });
  }
}
