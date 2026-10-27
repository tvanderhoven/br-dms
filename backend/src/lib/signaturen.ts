/**
 * Mail-Signaturen (Einstellungen → System)
 *
 * Mehrere benannte Signaturen, je Mailart eine Standardsignatur. Beim Versand lässt sich die
 * Signatur wechseln oder weglassen – damit z. B. ein Einwahl-Link in der Signatur für die
 * Einladung der Mitglieder nicht in Gästemails oder Empfangsbestätigungen landet.
 *
 * Gespeichert als JSON in den Systemeinstellungen (kleine Datenmenge, keine eigene Tabelle).
 * Die frühere Einzelsignatur (mail.signatur) wird, solange nichts Neues gespeichert ist,
 * als Signatur „Standard“ angeboten und gilt wie bisher für alle Mailarten.
 */

import prisma from "./prisma.js";

export const MAIL_SIGNATUR_ALT       = "mail.signatur";
export const MAIL_SIGNATUREN         = "mail.signaturen";
export const MAIL_SIGNATUR_STANDARD  = "mail.signatur_standard";

export const SIGNATUR_ARTEN = ["einladung", "gast", "empfang"] as const;
export type SignaturArt = typeof SIGNATUR_ARTEN[number];

export interface Signatur { id: string; name: string; text: string }
export type SignaturStandard = Record<SignaturArt, string>;   // Signatur-ID, "" = keine

export const MAX_SIGNATUREN = 20;
const ID_MUSTER = /^[A-Za-z0-9_-]{1,40}$/;

const KEINE: SignaturStandard = { einladung: "", gast: "", empfang: "" };

function lesen<T>(wert: string | undefined, vorgabe: T): T {
  if (!wert) return vorgabe;
  try { return JSON.parse(wert) as T; } catch { return vorgabe; }
}

export async function signaturenLaden(): Promise<{ signaturen: Signatur[]; standard: SignaturStandard }> {
  const e = await prisma.systemEinstellung.findMany({
    where: { schluessel: { in: [MAIL_SIGNATUREN, MAIL_SIGNATUR_STANDARD, MAIL_SIGNATUR_ALT] } },
  });
  const wert = (k: string) => e.find(x => x.schluessel === k)?.wert;

  if (wert(MAIL_SIGNATUREN) === undefined) {
    const alt = wert(MAIL_SIGNATUR_ALT)?.trim();
    if (!alt) return { signaturen: [], standard: { ...KEINE } };
    return { signaturen: [{ id: "standard", name: "Standard", text: alt }], standard: { einladung: "standard", gast: "standard", empfang: "standard" } };
  }
  const signaturen = lesen<Signatur[]>(wert(MAIL_SIGNATUREN), []);
  const standard = { ...KEINE, ...lesen<Partial<SignaturStandard>>(wert(MAIL_SIGNATUR_STANDARD), {}) };
  return { signaturen, standard };
}

/** Prüft und bereinigt die Eingabe der Einstellungsseite; wirft Error mit verständlicher Meldung */
export function signaturenPruefen(signaturen: unknown, standard: unknown): { signaturen: Signatur[]; standard: SignaturStandard } {
  if (!Array.isArray(signaturen)) throw new Error("Signaturen fehlen");
  if (signaturen.length > MAX_SIGNATUREN) throw new Error(`Höchstens ${MAX_SIGNATUREN} Signaturen`);
  const ids = new Set<string>();
  const ergebnis: Signatur[] = signaturen.map((s: Partial<Signatur>) => {
    const id = String(s?.id ?? "");
    const name = String(s?.name ?? "").trim().slice(0, 60);
    const text = String(s?.text ?? "").trim().slice(0, 2000);
    if (!ID_MUSTER.test(id) || ids.has(id)) throw new Error("Ungültige Signatur-ID");
    if (!name) throw new Error("Jede Signatur braucht einen Namen");
    ids.add(id);
    return { id, name, text };
  });
  const namen = ergebnis.map(s => s.name.toLowerCase());
  if (new Set(namen).size !== namen.length) throw new Error("Signaturnamen müssen verschieden sein");

  const std = standard && typeof standard === "object" ? standard as Partial<SignaturStandard> : {};
  const gepruefterStandard = { ...KEINE };
  for (const art of SIGNATUR_ARTEN) {
    const id = std[art] ?? "";
    if (id && !ids.has(id)) throw new Error("Standardsignatur gibt es nicht");
    gepruefterStandard[art] = id;
  }
  return { signaturen: ergebnis, standard: gepruefterStandard };
}

export async function signaturenSpeichern(signaturen: Signatur[], standard: SignaturStandard): Promise<void> {
  for (const [schluessel, wert] of [[MAIL_SIGNATUREN, JSON.stringify(signaturen)], [MAIL_SIGNATUR_STANDARD, JSON.stringify(standard)]] as const) {
    await prisma.systemEinstellung.upsert({ where: { schluessel }, update: { wert }, create: { schluessel, wert } });
  }
}

/**
 * Text der Signatur für eine Mailart. signaturId: undefined = Standard dieser Mailart,
 * "" = bewusst keine, sonst die gewählte Signatur (unbekannte ID = keine).
 */
export async function signaturText(art: SignaturArt, signaturId?: string): Promise<string | null> {
  const { signaturen, standard } = await signaturenLaden();
  const id = signaturId ?? standard[art];
  return signaturen.find(s => s.id === id)?.text.trim() || null;
}
