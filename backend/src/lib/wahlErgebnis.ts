/**
 * Wahlergebnis übernehmen (Stufe 3): Gewählte bekommen Rolle, Wahlrang und
 * Geschlecht – das speist die Nachrück-Logik (lib/ersatzVorschlag.ts). Wie beim
 * CSV-Import zuerst als Vorschau (ausfuehren = false), dann tatsächlich.
 *
 * Die Reihenfolge der Zeilen ist der Wahlrang, so wie ihn der Wahlvorstand
 * festgestellt hat (Mitglieder zuerst, dann Ersatzmitglieder). Das Programm
 * rechnet die Sitzverteilung nicht selbst nach – es prüft nur auf Auffälligkeiten.
 *
 * BR-Wahl:  Mitglieder → MITGLIED (Vorsitz/Stellvertretung behalten ihre Rolle bis
 *           zur konstituierenden Sitzung), Ersatz → ERSATZMITGLIED; Wahlrang 1…n.
 * JAV-Wahl: Mitglieder → JAV; Ersatzmitglieder werden nur im Ergebnis vermerkt.
 */

import { randomBytes } from "node:crypto";
import { AuditAktion, Geschlecht, Prisma, PrismaClient, Role, Wahl, WahlArt } from "@prisma/client";
import defaultPrisma from "./prisma.js";
import { hashPassword } from "./password.js";
import { waehlerlisteBerechnen } from "./waehlerliste.js";
import { sitzungAnlegen } from "./sitzungAnlegen.js";

export type Gewaehlt = "MITGLIED" | "ERSATZ";

export interface ErgebnisZeile {
  name:        string;
  gewaehlt:    Gewaehlt;
  stimmen?:    number | null;
  email?:      string | null;     // nur für neue Konten nötig
  geschlecht?: Geschlecht | null; // sonst aus Konto bzw. Mitarbeiterdaten
}

export interface ErgebnisEingabe {
  zeilen:                     ErgebnisZeile[];
  nichtGewaehlteDeaktivieren: boolean;
  quoteUebernehmen:           boolean;
  konstituierendeSitzungAm?:  string | null;
}

export interface ZeilenPlan {
  rang:        number;
  name:        string;
  gewaehlt:    Gewaehlt;
  stimmen:     number | null;
  aktion:      "AKTUALISIEREN" | "NEU" | "NUR_ERGEBNIS" | "FEHLER";
  benutzerId:  string | null;
  alteRolle:   Role | null;
  neueRolle:   Role | null;
  geschlecht:  Geschlecht | null;
  fehler?:     string;
}

export interface ErgebnisPlan {
  zeilen:        ZeilenPlan[];
  deaktivieren:  { id: string; name: string; rolle: Role }[];
  wahlrangWeg:   { id: string; name: string }[];   // behalten das Konto, verlieren den alten Wahlrang
  quote:         { geschlecht: Geschlecht; mindestsitze: number } | null;
  warnungen:     string[];
  fehlerfrei:    boolean;
}

const BR_ROLLEN: Role[] = [Role.VORSITZ, Role.STELLVERTRETER, Role.MITGLIED, Role.ERSATZMITGLIED];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const schluessel = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export async function ergebnisPlanen(
  wahl: Wahl,
  eingabe: ErgebnisEingabe,
  ausfuehrenderId: string,
  client: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<ErgebnisPlan> {
  const br = wahl.art === WahlArt.BR;
  const [benutzer, liste] = await Promise.all([
    client.benutzer.findMany({ select: { id: true, name: true, email: true, rolle: true, aktiv: true, geschlecht: true } }),
    waehlerlisteBerechnen(wahl, client),
  ]);
  const benutzerProName = new Map<string, typeof benutzer>();
  for (const b of benutzer) benutzerProName.set(schluessel(b.name), [...(benutzerProName.get(schluessel(b.name)) ?? []), b]);
  const mitarbeiterProName = new Map(liste.waehler.map(w => [schluessel(`${w.vorname} ${w.nachname}`), w]));
  const vergebeneEmails = new Set(benutzer.map(b => b.email.toLowerCase()));

  const warnungen: string[] = [];
  const gesehen = new Set<string>();
  const zeilen: ZeilenPlan[] = eingabe.zeilen
    .filter(z => z.name?.trim())
    .map((z, i): ZeilenPlan => {
      const plan: ZeilenPlan = {
        rang: i + 1, name: z.name.trim().replace(/\s+/g, " "), gewaehlt: z.gewaehlt,
        stimmen: Number.isFinite(z.stimmen) ? Number(z.stimmen) : null,
        aktion: "AKTUALISIEREN", benutzerId: null, alteRolle: null, neueRolle: null, geschlecht: null,
      };
      const key = schluessel(plan.name);
      if (gesehen.has(key)) return { ...plan, aktion: "FEHLER", fehler: "Doppelt in der Liste" };
      gesehen.add(key);

      const treffer = benutzerProName.get(key) ?? [];
      if (treffer.length > 1) return { ...plan, aktion: "FEHLER", fehler: "Mehrere Konten mit diesem Namen – bitte in der Benutzerverwaltung eindeutig benennen" };
      const konto = treffer[0];
      plan.geschlecht = z.geschlecht ?? konto?.geschlecht ?? mitarbeiterProName.get(key)?.geschlecht ?? null;

      // JAV-Ersatzmitglieder bekommen (noch) keinen Zugang – sie stehen nur im Ergebnis
      if (!br && z.gewaehlt === "ERSATZ") return { ...plan, aktion: "NUR_ERGEBNIS", benutzerId: konto?.id ?? null, alteRolle: konto?.rolle ?? null };

      plan.neueRolle = !br ? Role.JAV
        : z.gewaehlt === "ERSATZ" ? Role.ERSATZMITGLIED
        : konto && (konto.rolle === Role.VORSITZ || konto.rolle === Role.STELLVERTRETER) ? konto.rolle
        : Role.MITGLIED;

      if (konto) {
        plan.benutzerId = konto.id;
        plan.alteRolle = konto.rolle;
        if (konto.rolle === Role.ADMIN) {
          plan.neueRolle = Role.ADMIN;
          warnungen.push(`${plan.name} ist Admin – die Rolle bleibt, nur Wahlrang und Geschlecht werden gesetzt.`);
        }
        if (br && z.gewaehlt === "ERSATZ" && (konto.rolle === Role.VORSITZ || konto.rolle === Role.STELLVERTRETER)) {
          warnungen.push(`${plan.name} war ${konto.rolle === Role.VORSITZ ? "Vorsitz" : "Stellvertretung"} und ist jetzt Ersatzmitglied.`);
        }
        return plan;
      }

      const email = z.email?.trim().toLowerCase() ?? "";
      if (!email) return { ...plan, aktion: "FEHLER", fehler: "Kein Konto mit diesem Namen – E-Mail-Adresse für ein neues Konto angeben" };
      if (!EMAIL.test(email)) return { ...plan, aktion: "FEHLER", fehler: "Ungültige E-Mail-Adresse" };
      if (vergebeneEmails.has(email)) return { ...plan, aktion: "FEHLER", fehler: "E-Mail-Adresse gehört schon zu einem anderen Konto" };
      vergebeneEmails.add(email);
      return { ...plan, aktion: "NEU" };
    });

  // Wer bisher dazugehörte und nicht (wieder)gewählt ist
  const gewaehlteIds = new Set(zeilen.map(z => z.benutzerId).filter(Boolean));
  const bisher = benutzer.filter(b => b.aktiv && !gewaehlteIds.has(b.id)
    && (br ? BR_ROLLEN.includes(b.rolle) : b.rolle === Role.JAV));
  const deaktivieren = eingabe.nichtGewaehlteDeaktivieren ? bisher.map(b => ({ id: b.id, name: b.name, rolle: b.rolle })) : [];
  const wahlrangWeg = br && !eingabe.nichtGewaehlteDeaktivieren ? bisher.map(b => ({ id: b.id, name: b.name })) : [];

  // Auffälligkeiten
  const mitglieder = zeilen.filter(z => z.gewaehlt === "MITGLIED");
  if (liste.groesse.sitze > 0 && mitglieder.length !== liste.groesse.sitze) {
    warnungen.push(`${mitglieder.length} Mitglieder eingetragen, laut Wählerliste sind es ${liste.groesse.sitze} Sitze (${liste.groesse.grundlage}).`);
  }
  const quote = liste.minderheit ? { geschlecht: liste.minderheit.geschlecht, mindestsitze: liste.minderheit.mindestsitze } : null;
  if (quote) {
    const anzahl = mitglieder.filter(z => z.geschlecht === quote.geschlecht).length;
    if (anzahl < quote.mindestsitze) {
      warnungen.push(`Nur ${anzahl} ${quote.geschlecht === Geschlecht.WEIBLICH ? "Frauen" : "Männer"} unter den Mitgliedern – mindestens ${quote.mindestsitze} wären nötig (§ 15 Abs. 2).`);
    }
  }
  const ohneGeschlecht = zeilen.filter(z => z.aktion !== "FEHLER" && !z.geschlecht).length;
  if (ohneGeschlecht > 0) warnungen.push(`${ohneGeschlecht} Gewählte ohne Geschlecht – für die Nachrück-Logik nachtragen.`);
  if (deaktivieren.some(d => d.id === ausfuehrenderId)) warnungen.push("Dein eigenes Konto wird deaktiviert – du wirst danach abgemeldet.");
  if (br) {
    const vorsitzBleibt = zeilen.some(z => z.neueRolle === Role.VORSITZ)
      || benutzer.some(b => b.aktiv && b.rolle === Role.VORSITZ && !deaktivieren.some(d => d.id === b.id));
    if (!vorsitzBleibt) warnungen.push("Danach hat niemand die Rolle Vorsitz. Die Rolle nach der konstituierenden Sitzung in der Benutzerverwaltung vergeben (Admin).");
  }

  return { zeilen, deaktivieren, wahlrangWeg, quote: br ? quote : null, warnungen, fehlerfrei: zeilen.length > 0 && zeilen.every(z => z.aktion !== "FEHLER") };
}

/** Führt einen fehlerfreien Plan aus – in einer Transaktion. */
export async function ergebnisUebernehmen(
  wahl: Wahl,
  eingabe: ErgebnisEingabe,
  ausfuehrenderId: string,
  tx: Prisma.TransactionClient,
): Promise<ErgebnisPlan> {
  const plan = await ergebnisPlanen(wahl, eingabe, ausfuehrenderId, tx);
  if (!plan.fehlerfrei) return plan;
  const br = wahl.art === WahlArt.BR;
  const eingabeProName = new Map(eingabe.zeilen.map(z => [schluessel(z.name), z]));

  for (const z of plan.zeilen) {
    if (z.aktion === "NUR_ERGEBNIS") continue;
    const daten = {
      rolle: z.neueRolle!, aktiv: true, geschlecht: z.geschlecht,
      ...(br && { wahlReihenfolge: z.rang }),
    };
    if (z.aktion === "AKTUALISIEREN") {
      await tx.benutzer.update({ where: { id: z.benutzerId! }, data: daten });
    } else {
      // Zufallspasswort – der Vorsitz setzt in der Benutzerverwaltung ein neues
      const neu = await tx.benutzer.create({
        data: { ...daten, name: z.name, email: eingabeProName.get(schluessel(z.name))!.email!.trim().toLowerCase(), passwortHash: hashPassword(randomBytes(24).toString("hex")) },
      });
      z.benutzerId = neu.id;
      await tx.auditLog.create({ data: { benutzerId: ausfuehrenderId, aktion: AuditAktion.BENUTZER_ERSTELLT, details: { name: z.name, quelle: `Wahl: ${wahl.titel}` } } });
    }
  }

  for (const d of plan.deaktivieren) {
    await tx.benutzer.update({ where: { id: d.id }, data: { aktiv: false, ...(br && { wahlReihenfolge: null }) } });
    await tx.auditLog.create({ data: { benutzerId: ausfuehrenderId, aktion: AuditAktion.BENUTZER_DEAKTIVIERT, details: { name: d.name, quelle: `Wahl: ${wahl.titel}` } } });
  }
  if (plan.wahlrangWeg.length > 0) {
    await tx.benutzer.updateMany({ where: { id: { in: plan.wahlrangWeg.map(w => w.id) } }, data: { wahlReihenfolge: null } });
  }

  if (br && eingabe.quoteUebernehmen && plan.quote) {
    for (const [schl, wert] of [["wahl.minderheitengeschlecht", plan.quote.geschlecht], ["wahl.mindestsitze_minderheit", String(plan.quote.mindestsitze)]]) {
      await tx.systemEinstellung.upsert({ where: { schluessel: schl }, update: { wert }, create: { schluessel: schl, wert } });
    }
  }

  // Konstituierende Sitzung – erst jetzt, damit die neuen Mitglieder auf der Anwesenheitsliste stehen
  let konstituierendeSitzungId = wahl.konstituierendeSitzungId;
  if (br && eingabe.konstituierendeSitzungAm && !konstituierendeSitzungId) {
    const am = new Date(eingabe.konstituierendeSitzungAm);
    konstituierendeSitzungId = await sitzungAnlegen({
      titel: `Konstituierende Sitzung am ${am.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`,
      sitzungsdatum: am, sitzungstyp: "KONSTITUIEREND", erstelltVonId: ausfuehrenderId,
      notizen: `Nach der ${wahl.titel}. Einberufung durch den Wahlvorstand (§ 29 Abs. 1 BetrVG).`,
    }, tx);
  }

  await tx.wahl.update({
    where: { id: wahl.id },
    data: {
      ergebnis: plan.zeilen.map(z => ({ rang: z.rang, name: z.name, gewaehlt: z.gewaehlt, stimmen: z.stimmen, geschlecht: z.geschlecht, benutzerId: z.benutzerId })),
      ergebnisUebernommenAm: new Date(),
      konstituierendeSitzungId,
    },
  });
  return plan;
}
