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
import { berechneFristende } from "../lib/fristRechner.js";
import { ladeFeiertagsKalender } from "../lib/fristKalender.js";
import { FRIST_DAUER_AB_ZUGANG } from "../lib/fristen.js";
import { zugangVorschlag } from "../lib/zugang.js";
import { meldeFristsache } from "../lib/eingangMeldung.js";
import { Readable as ReadableStrom } from "node:stream";
import { EMAIL_MIME, EmailInhalt, emailFormat, emailKopf, emailLesen, emailVolltext } from "../lib/email.js";

/** Die hochgeladene Datei ist keine lesbare E-Mail (Endung .eml/.msg, Inhalt kaputt) */
export class UngueltigeEmailError extends Error {}

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
    vertraulichFuerMitglieder?: boolean;
    inboxQuelle?: string;
    ordnerId?: string;
    // Anhang einer E-Mail, der als eigenes Dokument abgelegt wird: keine eigenen
    // Fristen und kein Anhörungs-Vorgang – die gehören zur E-Mail selbst
    quelleDokumentId?: string;
    // Nur bei E-Mails: ablegbare Anhänge (PDF, Office, Mails) gleich als eigene Dokumente anlegen
    anhaengeAblegen?: boolean;
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
  const format    = emailFormat(originalDateiname, mimetype);

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

  // Größe und (bei E-Mails) Inhalt aus demselben geöffneten Handle lesen
  const datei = await fs.open(tmpPfad, "r");
  let stat: Awaited<ReturnType<typeof datei.stat>>;
  let inhalt: Buffer | null = null;
  try {
    stat = await datei.stat();
    if (format) inhalt = await datei.readFile();
  } finally {
    await datei.close();
  }

  let textinhalt: string | null = null;
  let email: EmailInhalt | null = null;
  if (format) {
    try {
      email = await emailLesen(inhalt!, format);
      textinhalt = emailVolltext(email);
    } catch (err) {
      await fs.unlink(tmpPfad).catch(() => {});
      throw new UngueltigeEmailError(`Die E-Mail „${originalDateiname}“ konnte nicht gelesen werden${err instanceof Error ? `: ${err.message}` : ""}`);
    }
  } else if (mimetype === "application/pdf") {
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

  const titel = metadata.titel?.trim()
    || email?.betreff
    || path.basename(originalDateiname, path.extname(originalDateiname)).replace(/[_-]+/g, " ").trim();

  const dokument = await prisma.dokument.create({
    data: {
      id:              docId,
      titel,
      kategorie,
      dateiname:       originalDateiname,
      speicherpfad:    relPfad,
      verschlPfad:     encName,
      dateigroesse:    stat.size,
      mimeTyp:         format ? EMAIL_MIME[format] : mimetype,
      pruefsumme:      checksum,
      aktenzeichen:    metadata.aktenzeichen ?? null,
      vertraulich:     metadata.vertraulich ?? false,
      vertraulichFuerMitglieder: (metadata.vertraulich ?? false) && (metadata.vertraulichFuerMitglieder ?? false),
      ordnerId:        metadata.ordnerId ?? null,
      emailKopf:       email ? (emailKopf(email) as any) : undefined,
      quelleDokumentId: metadata.quelleDokumentId ?? null,
      inboxQuelle:     metadata.inboxQuelle ?? "UPLOAD",
      // Anhänge kommen nicht einzeln in den Eingang – dort steht die E-Mail selbst
      inboxGelesen:    !!metadata.quelleDokumentId,
      textinhalt,
      deleteAt,
      hochgeladenVonId: userId,
    },
  });

  const istAnhang = !!metadata.quelleDokumentId;
  if (!istAnhang && await fristenAnlegen(docId, kategorie, metadata.kuendigungsArt, zugangVorschlag(new Date(), email?.datum))) {
    // Fristsache: Vorsitz/Stellvertretung sofort informieren – im Hintergrund,
    // damit ein langsamer Mailserver den Import nicht aufhält
    void meldeFristsache(docId).catch(err => console.error("[Eingang] Sofortmail:", err));
  }

  if (!istAnhang && (kategorie === Kategorie.ANHOERUNG_99 || kategorie === Kategorie.ANHOERUNG_102)) {
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
        ...(istAnhang ? { ausEmail: metadata.quelleDokumentId } : {}),
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

  if (email && metadata.anhaengeAblegen) {
    for (const a of email.anhaenge.filter(x => x.ablegbar)) {
      await anhangAblegen(dokument, a, userId, { ip, userAgent }).catch(err =>
        console.error(`[Pipeline] Anhang „${a.name}“ aus ${docId} nicht abgelegt:`, err));
    }
  }

  return dokument;
}

/**
 * Anhang einer E-Mail als eigenes Dokument ablegen. Übernimmt Kategorie,
 * Vertraulichkeit, Ordner und Aktenzeichen der E-Mail.
 */
export async function anhangAblegen(
  mail: { id: string; kategorie: Kategorie; vertraulich: boolean; vertraulichFuerMitglieder: boolean; ordnerId: string | null; aktenzeichen: string | null; inboxQuelle: string | null },
  anhang: { name: string; mimeTyp: string; inhalt: Buffer },
  userId: string,
  kontext: { ip?: string; userAgent?: string } = {},
) {
  return verarbeiteDokument({
    stream:            ReadableStrom.from(anhang.inhalt),
    originalDateiname: anhang.name,
    mimetype:          anhang.mimeTyp,
    userId,
    ip:                kontext.ip,
    userAgent:         kontext.userAgent,
    metadata: {
      kategorie:        mail.kategorie,
      vertraulich:      mail.vertraulich,
      vertraulichFuerMitglieder: mail.vertraulichFuerMitglieder,
      ordnerId:         mail.ordnerId ?? undefined,
      aktenzeichen:     mail.aktenzeichen ?? undefined,
      inboxQuelle:      mail.inboxQuelle ?? "UPLOAD",
      quelleDokumentId: mail.id,
    },
  });
}

async function fristenAnlegen(
  dokumentId: string,
  kategorie: Kategorie,
  kuendigungsArt: "ORDENTLICH" | "AUSSERORDENTLICH" | undefined,
  zugang: Date,
): Promise<boolean> {
  const typen: string[] = [];

  if (kategorie === Kategorie.ANHOERUNG_99) {
    typen.push("ANHOERUNG_99_WOCHE", "WIDERSPRUCH");
  }
  if (kategorie === Kategorie.ANHOERUNG_102) {
    if (kuendigungsArt === "AUSSERORDENTLICH") {
      typen.push("ANHOERUNG_102_AUSSERORDENTLICH");
    } else if (kuendigungsArt === "ORDENTLICH") {
      typen.push("ANHOERUNG_102_ORDENTLICH");
    } else {
      // Keine Angabe (z.B. automatischer Watchfolder-Import ohne manuelle
      // Klassifizierung) – sicherheitshalber beide Fristen anlegen; beim
      // Bestätigen des Zugangs (lib/zugang.ts) fällt die unpassende weg.
      typen.push("ANHOERUNG_102_ORDENTLICH", "ANHOERUNG_102_AUSSERORDENTLICH");
    }
  }
  if (kategorie === Kategorie.ZEITMODELL_87) {
    typen.push("ZEITMODELL_87_WOCHE");
  }

  if (typen.length === 0) return false;

  // Ende nach §§ 187, 188, 193 BGB (Wochenende/Feiertag → nächster Werktag).
  // Vorläufig ab dem vorgeschlagenen Zugang, bis Vorsitz/Stellvertretung ihn bestätigen.
  await prisma.dokument.update({ where: { id: dokumentId }, data: { zugangAm: zugang } });
  const kalender = await ladeFeiertagsKalender();
  for (const typ of typen) {
    const { ende } = berechneFristende(zugang, FRIST_DAUER_AB_ZUGANG[typ]!, kalender);
    await prisma.frist.create({ data: { dokumentId, typ: typ as any, faelligAm: ende } });
  }
  return true;
}
