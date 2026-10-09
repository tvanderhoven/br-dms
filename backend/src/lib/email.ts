/**
 * E-Mails als Dokumente
 *
 * Liest .eml (Thunderbird, „Speichern unter“, Webmailer) und .msg (Outlook)
 * in eine einheitliche Form: Kopf (Von, An, Cc, Datum, Betreff), Text, HTML
 * und Anhänge. Die Originaldatei bleibt unverändert verschlüsselt gespeichert;
 * gelesen wird bei Bedarf aus dem entschlüsselten Puffer.
 */

import path from "node:path";
import { simpleParser, AddressObject } from "mailparser";
import * as MsgReaderModul from "@kenjiuno/msgreader";

// CommonJS-Paket: je nach Bundling liegt die Klasse unter .default oder .default.default
const MsgReader: any = (MsgReaderModul as any).default?.default ?? (MsgReaderModul as any).default;

export type EmailFormat = "eml" | "msg";

export const EMAIL_MIME: Record<EmailFormat, string> = {
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
};

/** Ist die Datei eine E-Mail? Browser melden .msg oft als application/octet-stream – daher die Endung zuerst */
export function emailFormat(dateiname: string, mimetype?: string): EmailFormat | null {
  const ext = path.extname(dateiname).toLowerCase();
  if (ext === ".eml") return "eml";
  if (ext === ".msg") return "msg";
  if (mimetype === EMAIL_MIME.eml) return "eml";
  if (mimetype === EMAIL_MIME.msg) return "msg";
  return null;
}

export function istEmailMime(mimeTyp: string): boolean {
  return mimeTyp === EMAIL_MIME.eml || mimeTyp === EMAIL_MIME.msg;
}

// Anhänge, die als eigenes Dokument abgelegt werden können (wie beim Hochladen erlaubt)
export const ABLEGBARE_ANHANG_MIME: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".docm": "application/vnd.ms-word.document.macroEnabled.12",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".eml":  EMAIL_MIME.eml,
  ".msg":  EMAIL_MIME.msg,
};
const ABLEGBAR = new Set(Object.values(ABLEGBARE_ANHANG_MIME));

export interface EmailAnhang {
  nr:       number;   // fortlaufend, stabil für dieselbe Datei
  name:     string;
  mimeTyp:  string;
  groesse:  number;
  ablegbar: boolean;
  inhalt:   Buffer;
}

export interface EmailInhalt {
  format:   EmailFormat;
  betreff:  string;
  von:      string;
  an:       string[];
  cc:       string[];
  datum:    string | null;  // ISO
  text:     string;
  html:     string | null;  // mit eingebetteten Bildern als data:-URIs
  anhaenge: EmailAnhang[];
}

/** Kopfdaten ohne Inhalte – wird am Dokument gespeichert (emailKopf) */
export interface EmailKopf {
  format:   EmailFormat;
  betreff:  string;
  von:      string;
  an:       string[];
  cc:       string[];
  datum:    string | null;
  anhaenge: { nr: number; name: string; mimeTyp: string; groesse: number; ablegbar: boolean }[];
}

const MIME_NACH_ENDUNG: Record<string, string> = {
  ...ABLEGBARE_ANHANG_MIME,
  ".doc": "application/msword", ".xls": "application/vnd.ms-excel",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain", ".csv": "text/csv", ".zip": "application/zip",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
};

function anhangMime(name: string, gemeldet?: string): string {
  return MIME_NACH_ENDUNG[path.extname(name).toLowerCase()] ?? (gemeldet || "application/octet-stream");
}

/** Dateiname ohne Pfadanteile und Steuerzeichen */
function sichererName(name: string | undefined, nr: number): string {
  const n = (name ?? "").replace(/[\x00-\x1f\\/]+/g, "_").trim();
  return n || `Anhang_${nr}`;
}

function adressen(feld: AddressObject | AddressObject[] | undefined): string[] {
  if (!feld) return [];
  return (Array.isArray(feld) ? feld : [feld])
    .flatMap(a => a.value)
    .map(v => (v.name && v.address ? `${v.name} <${v.address}>` : v.address || v.name || ""))
    .filter(Boolean);
}

/** cid:-Verweise im HTML durch data:-URIs ersetzen – externe Inhalte bleiben in der Ansicht gesperrt */
function cidEinbetten(html: string, bilder: { cid: string; mimeTyp: string; inhalt: Buffer }[]): string {
  let ergebnis = html;
  for (const b of bilder) {
    if (!b.cid || !b.mimeTyp.startsWith("image/")) continue;
    const cid = b.cid.replace(/^<|>$/g, "");
    ergebnis = ergebnis.split(`cid:${cid}`).join(`data:${b.mimeTyp};base64,${b.inhalt.toString("base64")}`);
  }
  return ergebnis;
}

async function emlLesen(puffer: Buffer): Promise<EmailInhalt> {
  const mail = await simpleParser(puffer, { skipTextToHtml: true });
  const inline = mail.attachments.filter(a => a.related || (a.contentDisposition === "inline" && a.cid && a.contentType.startsWith("image/")));
  const echte  = mail.attachments.filter(a => !inline.includes(a));
  const anhaenge = echte.map((a, i): EmailAnhang => {
    const name = sichererName(a.filename, i + 1);
    const mimeTyp = anhangMime(name, a.contentType);
    return { nr: i + 1, name, mimeTyp, groesse: a.size ?? a.content.length, ablegbar: ABLEGBAR.has(mimeTyp), inhalt: a.content };
  });
  const html = typeof mail.html === "string"
    ? cidEinbetten(mail.html, inline.map(a => ({ cid: a.cid ?? "", mimeTyp: a.contentType, inhalt: a.content })))
    : null;
  return {
    format:  "eml",
    betreff: mail.subject?.trim() ?? "",
    von:     adressen(mail.from)[0] ?? "",
    an:      adressen(mail.to),
    cc:      adressen(mail.cc),
    datum:   mail.date ? mail.date.toISOString() : null,
    text:    (mail.text ?? "").trim(),
    html,
    anhaenge,
  };
}

function msgLesen(puffer: Buffer): EmailInhalt {
  const ab = puffer.buffer.slice(puffer.byteOffset, puffer.byteOffset + puffer.byteLength);
  const leser = new MsgReader(ab);
  const d = leser.getFileData();
  if (d.error) throw new Error(`Outlook-Datei nicht lesbar: ${d.error}`);

  const empfaenger = (typ: string) => (d.recipients ?? [])
    .filter((r: any) => (r.recipType ?? "to") === typ)
    .map((r: any) => {
      const adr = r.smtpAddress || r.email || "";
      return r.name && adr && r.name !== adr ? `${r.name} <${adr}>` : adr || r.name || "";
    })
    .filter(Boolean);

  const alle = (d.attachments ?? []) as any[];
  const inline: { cid: string; mimeTyp: string; inhalt: Buffer }[] = [];
  const anhaenge: EmailAnhang[] = [];
  for (const a of alle) {
    if (a.innerMsgContent) continue; // eingebettete Outlook-Nachricht: kein eigener Dateiinhalt
    let inhalt: Buffer;
    try { inhalt = Buffer.from(leser.getAttachment(a).content); } catch { continue; }
    const mimeTyp = anhangMime(a.fileName ?? "", a.attachMimeTag);
    if (a.pidContentId && (a.attachmentHidden || mimeTyp.startsWith("image/"))) {
      inline.push({ cid: a.pidContentId, mimeTyp, inhalt });
      if (a.attachmentHidden) continue;
    }
    const nr = anhaenge.length + 1;
    const name = sichererName(a.fileName, nr);
    anhaenge.push({ nr, name, mimeTyp, groesse: inhalt.length, ablegbar: ABLEGBAR.has(mimeTyp), inhalt });
  }

  let html: string | null = d.bodyHtml ?? null;
  if (!html && d.html) html = new TextDecoder("utf-8").decode(d.html);
  if (html) html = cidEinbetten(html, inline);

  const datum = d.clientSubmitTime || d.messageDeliveryTime || d.creationTime;
  const von = d.senderName && d.senderEmail && d.senderName !== d.senderEmail
    ? `${d.senderName} <${d.senderEmail}>` : (d.senderEmail || d.senderName || "");
  return {
    format:  "msg",
    betreff: (d.subject ?? "").trim(),
    von,
    an:      empfaenger("to"),
    cc:      empfaenger("cc"),
    datum:   datum && !Number.isNaN(new Date(datum).getTime()) ? new Date(datum).toISOString() : null,
    text:    (d.body ?? "").trim(),
    html,
    anhaenge,
  };
}

export async function emailLesen(puffer: Buffer, format: EmailFormat): Promise<EmailInhalt> {
  return format === "eml" ? emlLesen(puffer) : msgLesen(puffer);
}

export function emailKopf(m: EmailInhalt): EmailKopf {
  return {
    format: m.format, betreff: m.betreff, von: m.von, an: m.an, cc: m.cc, datum: m.datum,
    anhaenge: m.anhaenge.map(({ nr, name, mimeTyp, groesse, ablegbar }) => ({ nr, name, mimeTyp, groesse, ablegbar })),
  };
}

/** Text für die Volltextsuche: Kopf, Inhalt und Namen der Anhänge */
export function emailVolltext(m: EmailInhalt): string {
  const kopf = [
    `Betreff: ${m.betreff}`, `Von: ${m.von}`,
    m.an.length ? `An: ${m.an.join(", ")}` : "", m.cc.length ? `Cc: ${m.cc.join(", ")}` : "",
    m.anhaenge.length ? `Anhänge: ${m.anhaenge.map(a => a.name).join(", ")}` : "",
  ].filter(Boolean).join("\n");
  const text = m.text || (m.html ? m.html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : "");
  return `${kopf}\n\n${text}`.slice(0, 100_000);
}
