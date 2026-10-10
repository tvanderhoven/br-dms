/**
 * Zwei-Faktor-Anmeldung per Authenticator-App (TOTP, RFC 6238)
 *
 * Bewusst ohne eigene TOTP-Bibliothek: Das Verfahren ist ein HMAC-SHA1 über
 * einen 30-Sekunden-Zähler – das deckt node:crypto ab. Nur der QR-Code kommt
 * aus dem Paket "qrcode".
 *
 * Schalter in Einstellungen → Sicherheit (nur Admin):
 *   aus        – Standard; niemand wird nach einem Code gefragt, auch wer ihn eingerichtet hat
 *   freiwillig – jede Person kann sie unter „Mein Konto“ einrichten
 *   + Pflicht-Rollen – diese Rollen müssen sie beim nächsten Login einrichten
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Prisma, Role } from "@prisma/client";
import QRCode from "qrcode";
import prisma from "./prisma.js";

export const ZWEI_FAKTOR_MODUS  = "sicherheit.zwei_faktor_modus";   // "aus" | "freiwillig"
export const ZWEI_FAKTOR_PFLICHT = "sicherheit.zwei_faktor_pflicht"; // JSON-Liste von Rollen

export type ZweiFaktorModus = "aus" | "freiwillig";

export interface ZweiFaktorRichtlinie {
  modus:         ZweiFaktorModus;
  pflichtRollen: Role[];
}

export async function zweiFaktorRichtlinie(): Promise<ZweiFaktorRichtlinie> {
  const e = await prisma.systemEinstellung.findMany({
    where: { schluessel: { in: [ZWEI_FAKTOR_MODUS, ZWEI_FAKTOR_PFLICHT] } },
  });
  const modus = e.find(x => x.schluessel === ZWEI_FAKTOR_MODUS)?.wert === "freiwillig" ? "freiwillig" : "aus";
  let pflichtRollen: Role[] = [];
  try {
    const roh = JSON.parse(e.find(x => x.schluessel === ZWEI_FAKTOR_PFLICHT)?.wert ?? "[]");
    if (Array.isArray(roh)) pflichtRollen = roh.filter((r): r is Role => Object.values(Role).includes(r));
  } catch { /* kaputter Wert = keine Pflicht */ }
  // Ohne eingeschaltete 2FA gibt es auch keine Pflicht
  return { modus, pflichtRollen: modus === "aus" ? [] : pflichtRollen };
}

export async function istPflicht(rolle: Role): Promise<boolean> {
  return (await zweiFaktorRichtlinie()).pflichtRollen.includes(rolle);
}

// ── Base32 (RFC 4648, ohne Auffüllung) – Format, das Authenticator-Apps erwarten ──

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(buf: Buffer): string {
  let bits = 0, wert = 0, aus = "";
  for (const byte of buf) {
    wert = (wert << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      aus += ALPHABET[(wert >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) aus += ALPHABET[(wert << (5 - bits)) & 31];
  return aus;
}

function base32Lesen(text: string): Buffer {
  let bits = 0, wert = 0;
  const bytes: number[] = [];
  for (const z of text.replace(/=+$/, "").toUpperCase()) {
    const i = ALPHABET.indexOf(z);
    if (i < 0) throw new Error("Ungültiges Base32-Zeichen");
    wert = (wert << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((wert >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ── TOTP ─────────────────────────────────────────────────────────

const SCHRITT_SEKUNDEN = 30;

function code(geheimnis: Buffer, schritt: number): string {
  const zaehler = Buffer.alloc(8);
  zaehler.writeBigUInt64BE(BigInt(schritt));
  const hmac = createHmac("sha1", geheimnis).update(zaehler).digest();
  const versatz = hmac[hmac.length - 1] & 0x0f;
  const zahl = (hmac.readUInt32BE(versatz) & 0x7fffffff) % 1_000_000;
  return zahl.toString().padStart(6, "0");
}

export function aktuellerSchritt(jetzt = Date.now()): number {
  return Math.floor(jetzt / 1000 / SCHRITT_SEKUNDEN);
}

/** Nur für Tests: den Code zu einem Geheimnis erzeugen, wie es die App täte */
export function codeFuer(geheimnisBase32: string, schritt = aktuellerSchritt()): string {
  return code(base32Lesen(geheimnisBase32), schritt);
}

/**
 * Prüft einen 6-stelligen Code mit ±1 Schritt Toleranz (Uhren gehen selten genau).
 * Liefert den Schritt, zu dem er passt – der wird gespeichert, damit derselbe Code
 * nicht ein zweites Mal durchgeht. null = falsch oder schon benutzt.
 */
export function codePruefen(geheimnisBase32: string, eingabe: string, letzterSchritt: number | null): number | null {
  const sauber = eingabe.replace(/\s/g, "");
  if (!/^\d{6}$/.test(sauber)) return null;
  const geheimnis = base32Lesen(geheimnisBase32);
  const jetzt = aktuellerSchritt();
  for (const schritt of [jetzt - 1, jetzt, jetzt + 1]) {
    if (letzterSchritt !== null && schritt <= letzterSchritt) continue;
    if (timingSafeEqual(Buffer.from(code(geheimnis, schritt)), Buffer.from(sauber))) return schritt;
  }
  return null;
}

export function neuesGeheimnis(): string {
  return base32(randomBytes(20)); // 160 Bit, wie in RFC 4226 empfohlen
}

/** QR-Code (als data:-URL) und den Text zum Abtippen für die Authenticator-App */
export async function einrichtungsDaten(geheimnisBase32: string, email: string) {
  const aussteller = "BR-DMS";
  const url = `otpauth://totp/${encodeURIComponent(`${aussteller}:${email}`)}`
    + `?secret=${geheimnisBase32}&issuer=${encodeURIComponent(aussteller)}&algorithm=SHA1&digits=6&period=${SCHRITT_SEKUNDEN}`;
  return {
    geheimnis: geheimnisBase32.replace(/(.{4})/g, "$1 ").trim(),
    qrCode:    await QRCode.toDataURL(url, { margin: 1, width: 220 }),
  };
}

// ── Geheimnis verschlüsselt speichern (AES-256-GCM, Schlüssel aus ENCRYPTION_KEY) ──

function schluessel(benutzerId: string): Buffer {
  const master = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "hex");
  if (master.length !== 32) throw new Error("ENCRYPTION_KEY fehlt oder hat nicht 64 Hex-Zeichen");
  return scryptSync(master, `zwei-faktor:${benutzerId}`, 32, { N: 2048, r: 8, p: 1 });
}

export function geheimnisVerschluesseln(benutzerId: string, geheimnis: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", schluessel(benutzerId), iv);
  const daten = Buffer.concat([c.update(geheimnis, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), daten].map(b => b.toString("base64")).join(".");
}

export function geheimnisEntschluesseln(benutzerId: string, gespeichert: string): string {
  const [iv, tag, daten] = gespeichert.split(".").map(t => Buffer.from(t, "base64"));
  const d = createDecipheriv("aes-256-gcm", schluessel(benutzerId), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(daten), d.final()]).toString("utf8");
}

// ── Wiederherstellungscodes (falls das Handy weg ist) ────────────

const hash = (code: string) => createHash("sha256").update(code.replace(/[\s-]/g, "").toLowerCase()).digest("hex");

/** 10 Einmal-Codes wie "k7m2-x9qp"; gespeichert werden nur die Hashes */
export function neueWiederherstellungscodes(): { klartext: string[]; hashes: string[] } {
  const zeichen = "abcdefghjkmnpqrstuvwxyz23456789"; // ohne 0/o, 1/l/i
  const klartext = Array.from({ length: 10 }, () => {
    const b = randomBytes(8);
    const roh = Array.from(b, x => zeichen[x % zeichen.length]).join("");
    return `${roh.slice(0, 4)}-${roh.slice(4)}`;
  });
  return { klartext, hashes: klartext.map(hash) };
}

/** Index des passenden Codes in der Liste, -1 = keiner */
export function wiederherstellungscodeFinden(hashes: string[], eingabe: string): number {
  return hashes.indexOf(hash(eingabe));
}

// ── Einrichten (vom Login aus bei Pflicht oder unter „Mein Konto“) ──

/** Neues Geheimnis anlegen (noch nicht aktiv) und QR-Code liefern */
export async function einrichtungStarten(benutzerId: string, email: string) {
  const geheimnis = neuesGeheimnis();
  await prisma.benutzer.update({
    where: { id: benutzerId },
    data:  { zweiFaktorGeheimnis: geheimnisVerschluesseln(benutzerId, geheimnis), zweiFaktorAktiv: false },
  });
  return einrichtungsDaten(geheimnis, email);
}

/**
 * Ersten Code aus der App prüfen und die 2FA scharf schalten. Zählt die
 * Token-Version hoch (andere Sitzungen ohne zweiten Faktor enden).
 * null = Code falsch oder keine angefangene Einrichtung.
 */
export async function einrichtungAbschliessen(benutzerId: string, eingabe: string) {
  const b = await prisma.benutzer.findUnique({
    where:  { id: benutzerId },
    select: { zweiFaktorGeheimnis: true, zweiFaktorAktiv: true },
  });
  if (!b?.zweiFaktorGeheimnis || b.zweiFaktorAktiv) return null;
  const schritt = codePruefen(geheimnisEntschluesseln(benutzerId, b.zweiFaktorGeheimnis), eingabe, null);
  if (schritt === null) return null;

  const codes = neueWiederherstellungscodes();
  const neu = await prisma.benutzer.update({
    where:  { id: benutzerId },
    data:   {
      zweiFaktorAktiv: true, zweiFaktorLetzterSchritt: schritt,
      zweiFaktorWiederherstellung: codes.hashes, tokenVersion: { increment: 1 },
    },
    select: { id: true, email: true, rolle: true, tokenVersion: true },
  });
  return { benutzer: neu, wiederherstellungscodes: codes.klartext };
}

/** 2FA komplett entfernen (selbst abgeschaltet oder vom Vorsitz zurückgesetzt) */
export const ZWEI_FAKTOR_LEEREN: Prisma.BenutzerUpdateInput = {
  zweiFaktorGeheimnis: null, zweiFaktorAktiv: false, zweiFaktorLetzterSchritt: null, zweiFaktorWiederherstellung: [],
};

/**
 * Code beim Login prüfen: 6 Ziffern = Authenticator-App, sonst Wiederherstellungscode
 * (wird dabei verbraucht). true = durch.
 */
export async function anmeldeCodePruefen(benutzerId: string, eingabe: string): Promise<{ ok: boolean; wiederherstellung?: boolean; restCodes?: number }> {
  const b = await prisma.benutzer.findUnique({
    where:  { id: benutzerId },
    select: { zweiFaktorGeheimnis: true, zweiFaktorAktiv: true, zweiFaktorLetzterSchritt: true, zweiFaktorWiederherstellung: true },
  });
  if (!b?.zweiFaktorAktiv || !b.zweiFaktorGeheimnis) return { ok: false };

  if (/^\s*\d{3}\s*\d{3}\s*$/.test(eingabe)) {
    const schritt = codePruefen(geheimnisEntschluesseln(benutzerId, b.zweiFaktorGeheimnis), eingabe, b.zweiFaktorLetzterSchritt);
    if (schritt === null) return { ok: false };
    // Bedingt aktualisieren: zwei gleichzeitige Anfragen mit demselben Code kommen nicht beide durch
    const { count } = await prisma.benutzer.updateMany({
      where: { id: benutzerId, OR: [{ zweiFaktorLetzterSchritt: null }, { zweiFaktorLetzterSchritt: { lt: schritt } }] },
      data:  { zweiFaktorLetzterSchritt: schritt },
    });
    return { ok: count === 1 };
  }

  const i = wiederherstellungscodeFinden(b.zweiFaktorWiederherstellung, eingabe);
  if (i < 0) return { ok: false };
  const rest = b.zweiFaktorWiederherstellung.filter((_, j) => j !== i);
  const { count } = await prisma.benutzer.updateMany({
    where: { id: benutzerId, zweiFaktorWiederherstellung: { has: b.zweiFaktorWiederherstellung[i] } },
    data:  { zweiFaktorWiederherstellung: rest },
  });
  return { ok: count === 1, wiederherstellung: true, restCodes: rest.length };
}
