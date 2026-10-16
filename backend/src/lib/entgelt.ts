/**
 * Entgeltsystem der Eingruppierung: welche Entgeltgruppen und Stufen es in
 * dieser Installation gibt (Stammdaten, Einstellungen → System). Die Einträge
 * der Mitarbeiter (GehaltsstufenEintrag.gruppe/.stufe) speichern die "nummer";
 * Bezeichnung, Reihenfolge und erlaubte Stufen kommen von hier.
 *
 * Sind noch keine Stammdaten angelegt (Update von einer älteren Version oder
 * Neuinstallation), legt der erste Zugriff die Standard-Vorlage
 * "Gruppe 1–6 / Stufe 1–4" an – genau das bisherige, fest eingebaute Verhalten.
 */

import { Entgeltgruppe, Entgeltstufe, Prisma, PrismaClient } from "@prisma/client";
import defaultPrisma from "./prisma.js";
import { ENTGELT_VORLAGEN, STANDARD_VORLAGE, type EntgeltVorlage } from "./entgeltVorlagen.js";

type Client = PrismaClient | Prisma.TransactionClient;

export interface Entgeltsystem {
  gruppen: Entgeltgruppe[];
  stufen:  Entgeltstufe[];
}

export class EntgeltFehler extends Error {}

const SORTIERUNG = [{ sortierung: "asc" as const }, { nummer: "asc" as const }];

async function vorlageSchreiben(client: Client, vorlage: EntgeltVorlage): Promise<void> {
  await client.entgeltstufe.createMany({
    data: vorlage.stufen.map((s, i) => ({ nummer: s.nummer, bezeichnung: s.bezeichnung, sortierung: i })),
    skipDuplicates: true,
  });
  await client.entgeltgruppe.createMany({
    data: vorlage.gruppen.map((g, i) => ({ nummer: g.nummer, bezeichnung: g.bezeichnung, sortierung: i, stufen: g.stufen ?? [] })),
    skipDuplicates: true,
  });
}

export async function ladeEntgeltsystem(client: Client = defaultPrisma): Promise<Entgeltsystem> {
  const laden = () => Promise.all([
    client.entgeltgruppe.findMany({ orderBy: SORTIERUNG }),
    client.entgeltstufe.findMany({ orderBy: SORTIERUNG }),
  ]);
  let [gruppen, stufen] = await laden();
  if (gruppen.length === 0 && stufen.length === 0) {
    await vorlageSchreiben(client, ENTGELT_VORLAGEN.find(v => v.schluessel === STANDARD_VORLAGE)!);
    [gruppen, stufen] = await laden();
  }
  return { gruppen, stufen };
}

/** "EG 7 Stufe 3" – für Nummern ohne Stammdaten ein lesbarer Ersatz */
export function eingruppierungText(system: Entgeltsystem, gruppe: number, stufe: number): string {
  const g = system.gruppen.find(x => x.nummer === gruppe)?.bezeichnung ?? `Gruppe ${gruppe}`;
  const s = system.stufen.find(x => x.nummer === stufe)?.bezeichnung ?? `Stufe ${stufe}`;
  return `${g} ${s}`;
}

/**
 * Fehlertext, wenn die Kombination nicht erlaubt ist, sonst null.
 * nurAktive: für neue Werte – ein bestehender Eintrag mit inzwischen
 * deaktivierter Gruppe bleibt beim Bearbeiten gültig.
 */
export function eingruppierungPruefen(system: Entgeltsystem, gruppe: unknown, stufe: unknown, nurAktive = true): string | null {
  if (!Number.isInteger(gruppe) || !Number.isInteger(stufe)) return "Gruppe und Stufe sind Pflicht";
  const g = system.gruppen.find(x => x.nummer === gruppe);
  const s = system.stufen.find(x => x.nummer === stufe);
  if (!g) return `Entgeltgruppe ${gruppe} ist nicht angelegt (Einstellungen → System)`;
  if (!s) return `Stufe ${stufe} ist nicht angelegt (Einstellungen → System)`;
  if (nurAktive && !g.aktiv) return `${g.bezeichnung} ist deaktiviert`;
  if (nurAktive && !s.aktiv) return `${s.bezeichnung} ist deaktiviert`;
  if (g.stufen.length > 0 && !g.stufen.includes(s.nummer)) return `${g.bezeichnung} hat keine ${s.bezeichnung}`;
  return null;
}

const normal = (t: string) => t.toLowerCase().replace(/\s+/g, "");

/**
 * CSV-Teile auflösen: "4" / "Gruppe 4" / "EG7" / "EG 7" für die Gruppe,
 * "1" / "Stufe 1" für die Stufe. Zahlen sind die interne Nummer.
 */
export function eingruppierungAufloesen(system: Entgeltsystem, gruppeTeil: string, stufeTeil: string): { gruppe: number; stufe: number } | null {
  const finde = <T extends { nummer: number; bezeichnung: string }>(liste: T[], teil: string) => {
    const t = teil.trim();
    if (/^\d+$/.test(t)) return liste.find(x => x.nummer === Number(t));
    return liste.find(x => normal(x.bezeichnung) === normal(t));
  };
  const g = finde(system.gruppen, gruppeTeil);
  const s = finde(system.stufen, stufeTeil);
  return g && s ? { gruppe: g.nummer, stufe: s.nummer } : null;
}

/** Welche Gruppen- und Stufen-Nummern von Einträgen benutzt werden (nicht löschbar) */
export async function belegteNummern(client: Client = defaultPrisma): Promise<{ gruppen: number[]; stufen: number[] }> {
  const eintraege = await client.gehaltsstufenEintrag.findMany({
    where:    { gruppe: { not: null } },
    select:   { gruppe: true, stufe: true },
    distinct: ["gruppe", "stufe"],
  });
  return {
    gruppen: [...new Set(eintraege.map(e => e.gruppe!))].sort((a, b) => a - b),
    stufen:  [...new Set(eintraege.filter(e => e.stufe !== null).map(e => e.stufe!))].sort((a, b) => a - b),
  };
}

/**
 * Ersetzt Gruppen und Stufen durch eine Vorlage – nur solange noch keine
 * Eingruppierung darauf verweist, sonst würde sich die Bedeutung bestehender
 * Einträge ändern (dann einzeln umbenennen/ergänzen).
 */
export async function vorlageUebernehmen(schluessel: string, client: PrismaClient = defaultPrisma): Promise<Entgeltsystem> {
  const vorlage = ENTGELT_VORLAGEN.find(v => v.schluessel === schluessel);
  if (!vorlage) throw new EntgeltFehler("Unbekannte Vorlage");
  const belegt = await client.gehaltsstufenEintrag.count({ where: { gruppe: { not: null } } });
  if (belegt > 0) {
    throw new EntgeltFehler(`Es gibt schon ${belegt} Eingruppierung(en) – eine Vorlage würde deren Bedeutung ändern. Gruppen und Stufen bitte einzeln anpassen.`);
  }
  await client.$transaction(async tx => {
    await tx.entgeltgruppe.deleteMany();
    await tx.entgeltstufe.deleteMany();
    await vorlageSchreiben(tx, vorlage);
  });
  return ladeEntgeltsystem(client);
}
