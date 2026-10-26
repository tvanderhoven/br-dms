/**
 * Benachrichtigungen im System, E-Mail als Rückfall (Roadmap Paket 2):
 * Entstehen an den Auslösestellen, Stufe je Ereignis, Sichtbarkeit bei Kommentaren,
 * Mail erst nach 15 Minuten ungelesen und ohne Anwesenheit, gesammelt, ohne Inhalte.
 */

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Kategorie, Prisma, SitzungStatus } from "@prisma/client";
import { anfrage, type Konto, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";
import {
  faelligeAufgabenMelden, mailRueckfallSenden, MAIL_ABSTAND_MS, MAIL_WARTEZEIT_MS,
} from "../src/lib/benachrichtigung.js";
import { benachrichtigungMailInhalt, type BenachrichtigungMailEintrag } from "../src/lib/mailer.js";

let env: TestUmgebung;

before(async () => { env = await starteTestumgebung(); });
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.nachricht.deleteMany();
  await prisma.benutzer.updateMany({ data: { benachrichtigungen: Prisma.DbNull, zuletztAktiv: null } });
});

const benachrichtigungenVon = (konto: Konto) =>
  prisma.nachricht.findMany({ where: { empfaengerId: env.ids[konto], art: { not: null } }, orderBy: { erstelltAm: "asc" } });

/** Sammelt die Mails, statt sie zu verschicken */
function postfach() {
  const mails: { email: string; eintraege: BenachrichtigungMailEintrag[] }[] = [];
  return { mails, senden: async (email: string, _name: string, eintraege: BenachrichtigungMailEintrag[]) => { mails.push({ email, eintraege }); } };
}

const neueAufgabe = async (von: Konto, zugewiesenAn: Konto | null, titel = "Aufgabe") => {
  const res = await anfrage(env, von, "POST", "/api/aufgaben", { titel, zugewiesenAnId: zugewiesenAn ? env.ids[zugewiesenAn] : undefined });
  assert.equal(res.statusCode, 201, res.body);
  return res.json() as { id: string };
};

describe("Benachrichtigungen: Entstehung", () => {
  test("Aufgabe zugewiesen – an die Person, nicht an sich selbst, Mail erst nach 15 Minuten", async () => {
    const a = await neueAufgabe("VORSITZ", "MITGLIED", "BV mobiles Arbeiten prüfen");
    const [n] = await benachrichtigungenVon("MITGLIED");
    assert.equal(n?.art, "AUFGABE_ZUGEWIESEN");
    assert.equal(n?.link, `/aufgaben?aufgabe=${a.id}`);
    assert.match(n!.betreff, /BV mobiles Arbeiten/);
    assert.equal(n!.mailFaelligAb!.getTime() - n!.erstelltAm.getTime(), MAIL_WARTEZEIT_MS);

    await neueAufgabe("MITGLIED", "MITGLIED");
    assert.equal((await benachrichtigungenVon("MITGLIED")).length, 1);

    // Umhängen benachrichtigt die neue Person, erneutes Speichern ohne Wechsel nicht
    await anfrage(env, "VORSITZ", "PATCH", `/api/aufgaben/${a.id}`, { zugewiesenAnId: env.ids.STELLVERTRETER });
    await anfrage(env, "VORSITZ", "PATCH", `/api/aufgaben/${a.id}`, { titel: "Neuer Titel", zugewiesenAnId: env.ids.STELLVERTRETER });
    assert.equal((await benachrichtigungenVon("STELLVERTRETER")).length, 1);
  });

  test("Stufe je Ereignis: aus, nur im System, mit E-Mail", async () => {
    const res = await anfrage(env, "MITGLIED", "PUT", "/api/konto/benachrichtigungen", { stufen: { AUFGABE_ZUGEWIESEN: "AUS" } });
    assert.equal(res.statusCode, 200, res.body);
    await neueAufgabe("VORSITZ", "MITGLIED");
    assert.equal((await benachrichtigungenVon("MITGLIED")).length, 0);

    await anfrage(env, "MITGLIED", "PUT", "/api/konto/benachrichtigungen", { stufen: { AUFGABE_ZUGEWIESEN: "SYSTEM" } });
    await neueAufgabe("VORSITZ", "MITGLIED");
    const [n] = await benachrichtigungenVon("MITGLIED");
    assert.equal(n?.mailFaelligAb, null);

    assert.equal((await anfrage(env, "MITGLIED", "PUT", "/api/konto/benachrichtigungen", { stufen: { AUFGABE_ZUGEWIESEN: "LAUT" } })).statusCode, 400);
  });

  test("Kummerkasten nur für Vorsitz/Stellvertretung – auch nicht einstellbar für andere", async () => {
    const arten = (await anfrage(env, "MITGLIED", "GET", "/api/konto/benachrichtigungen")).json().arten.map((a: { art: string }) => a.art);
    assert.ok(!arten.includes("KUMMERKASTEN"));

    const res = await anfrage(env, null, "POST", "/api/kummerkasten", { nachricht: "Kantine Herr Müller" });
    assert.equal(res.statusCode, 201, res.body);
    const [n] = await benachrichtigungenVon("VORSITZ");
    assert.equal(n?.art, "KUMMERKASTEN");
    assert.ok(!n!.inhalt.includes("Müller"), "Text des Anliegens gehört nicht in die Benachrichtigung");
    assert.equal((await benachrichtigungenVon("STELLVERTRETER")).length, 1);
    assert.equal((await benachrichtigungenVon("MITGLIED")).length, 0);
    assert.equal((await benachrichtigungenVon("ADMIN")).length, 0);
  });

  test("Protokoll zur Unterschrift: Vorsitz, Stellvertretung und Protokollführung – Externe nie", async () => {
    const s = (await anfrage(env, "VORSITZ", "POST", "/api/sitzungen", { titel: "Sitzung", sitzungsdatum: "2026-12-01T09:00" })).json();
    await prisma.sitzung.update({ where: { id: s.id }, data: { status: SitzungStatus.PROTOKOLL_ENTWURF, protokollfuehrerId: env.ids.EXTERN } });
    await prisma.nachricht.deleteMany();
    const res = await anfrage(env, "VORSITZ", "POST", `/api/sitzungen/${s.id}/finalisieren`);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await benachrichtigungenVon("STELLVERTRETER"))[0]?.art, "PROTOKOLL_UNTERSCHRIFT");
    assert.equal((await benachrichtigungenVon("VORSITZ")).length, 0, "wer finalisiert, weiß es schon");
    assert.equal((await benachrichtigungenVon("EXTERN")).length, 0);
  });

  test("Protokollführung eingetragen – ohne Posteingang (Externe, JAV, SBV) ist die Mail sofort fällig", async () => {
    const s = (await anfrage(env, "VORSITZ", "POST", "/api/sitzungen", { titel: "Sitzung", sitzungsdatum: "2026-12-01T09:00" })).json();
    await prisma.sitzung.update({ where: { id: s.id }, data: { protokollfuehrerId: null } });
    await prisma.nachricht.deleteMany();
    assert.equal((await anfrage(env, "VORSITZ", "PATCH", `/api/sitzungen/${s.id}`, { protokollfuehrerId: env.ids.EXTERN })).statusCode, 200);
    const [n] = await benachrichtigungenVon("EXTERN");
    assert.equal(n?.art, "PROTOKOLLFUEHRUNG");
    assert.equal(n!.mailFaelligAb!.getTime(), n!.erstelltAm.getTime());
  });

  test("Ladung als Ersatzmitglied nur vor der Sitzung", async () => {
    const s = (await anfrage(env, "VORSITZ", "POST", "/api/sitzungen", { titel: "Sitzung", sitzungsdatum: "2026-12-01T09:00" })).json();
    const eintragen = () => anfrage(env, "VORSITZ", "POST", `/api/sitzungen/${s.id}/anwesenheit`, {
      benutzerId: env.ids.ERSATZMITGLIED, status: "ERSATZ_FUER", vertretungFuerId: env.ids.MITGLIED,
    });
    assert.equal((await eintragen()).statusCode, 201);
    await eintragen(); // unverändert – keine zweite
    assert.equal((await benachrichtigungenVon("ERSATZMITGLIED")).filter(n => n.art === "ERSATZ_GELADEN").length, 1);

    await prisma.nachricht.deleteMany();
    await prisma.anwesenheit.deleteMany({ where: { sitzungId: s.id } });
    await prisma.sitzung.update({ where: { id: s.id }, data: { status: SitzungStatus.PROTOKOLL_ENTWURF } });
    await eintragen();
    assert.equal((await benachrichtigungenVon("ERSATZMITGLIED")).length, 0);
  });

  test("fällige Aufgaben einmal am Tag – zweiter Lauf erzeugt keine Dublette", async () => {
    const a = await neueAufgabe("MITGLIED", null);
    await prisma.aufgabe.update({ where: { id: a.id }, data: { faelligAm: new Date() } });
    assert.equal(await faelligeAufgabenMelden(), 1);
    assert.equal(await faelligeAufgabenMelden(), 0);
    assert.equal((await benachrichtigungenVon("MITGLIED"))[0]?.art, "AUFGABE_FAELLIG");
  });
});

describe("Benachrichtigungen: Kommentare", () => {
  const dokument = (vertraulich: boolean) => prisma.dokument.create({
    data: {
      titel: "Abmahnung Schmidt", vertraulich, kategorie: Kategorie.SONSTIGES,
      dateiname: "test.txt", speicherpfad: "nicht/vorhanden", verschlPfad: "nicht/vorhanden",
      dateigroesse: 1, mimeTyp: "text/plain", pruefsumme: "x", hochgeladenVonId: env.ids.VORSITZ,
    },
  });
  const erwaehnung = (...konten: Konto[]) => ({
    type: "doc",
    content: [{ type: "paragraph", content: konten.map(k => ({ type: "personErwaehnung", attrs: { benutzerId: env.ids[k], name: k } })) }],
  });

  test("Erwähnung nur, wer das Dokument sehen darf", async () => {
    const d = await dokument(true);
    const res = await anfrage(env, "VORSITZ", "POST", `/api/dokumente/${d.id}/kommentare`, {
      inhalt: "@STELLVERTRETER @MITGLIED", inhaltJson: erwaehnung("STELLVERTRETER", "MITGLIED"),
    });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal((await benachrichtigungenVon("STELLVERTRETER"))[0]?.art, "ERWAEHNUNG");
    assert.equal((await benachrichtigungenVon("MITGLIED")).length, 0, "vertrauliches Dokument – kein Titel im Betreff");
  });

  test("Antwort an frühere Kommentierende, Erwähnte nur einmal", async () => {
    const d = await dokument(false);
    const url = `/api/dokumente/${d.id}/kommentare`;
    await anfrage(env, "MITGLIED", "POST", url, { inhalt: "Erster" });
    await anfrage(env, "STELLVERTRETER", "POST", url, { inhalt: "Zweiter" });
    await prisma.nachricht.deleteMany();

    await anfrage(env, "VORSITZ", "POST", url, { inhalt: "@MITGLIED", inhaltJson: erwaehnung("MITGLIED") });
    assert.deepEqual((await benachrichtigungenVon("MITGLIED")).map(n => n.art), ["ERWAEHNUNG"]);
    assert.deepEqual((await benachrichtigungenVon("STELLVERTRETER")).map(n => n.art), ["KOMMENTAR_ANTWORT"]);
    assert.equal((await benachrichtigungenVon("VORSITZ")).length, 0);
  });
});

describe("Benachrichtigungen: Mail-Rückfall", () => {
  test("erst nach 15 Minuten, gesammelt, nur Art und Link", async () => {
    await neueAufgabe("VORSITZ", "MITGLIED", "Kündigung Meier");
    await neueAufgabe("VORSITZ", "MITGLIED", "Zweite");
    const p = postfach();
    const jetzt = Date.now();

    await mailRueckfallSenden({ jetzt: new Date(jetzt + 5 * 60_000), senden: p.senden });
    assert.equal(p.mails.length, 0);

    await mailRueckfallSenden({ jetzt: new Date(jetzt + MAIL_WARTEZEIT_MS + 1000), senden: p.senden });
    assert.equal(p.mails.length, 1);
    assert.equal(p.mails[0].eintraege.length, 2);
    const inhalt = benachrichtigungMailInhalt("Mitglied", p.mails[0].eintraege);
    assert.ok(!(inhalt.subject + inhalt.text + inhalt.html).includes("Meier"), "keine Inhalte in der Mail");

    // Kein zweites Mal für dieselben
    await mailRueckfallSenden({ jetzt: new Date(jetzt + 2 * MAIL_ABSTAND_MS), senden: p.senden });
    assert.equal(p.mails.length, 1);
  });

  test("entfällt, wenn gelesen oder die Person inzwischen in BR-DMS war", async () => {
    await neueAufgabe("VORSITZ", "MITGLIED");
    await neueAufgabe("VORSITZ", "STELLVERTRETER");
    const [n] = await benachrichtigungenVon("MITGLIED");
    await anfrage(env, "MITGLIED", "PATCH", `/api/nachrichten/${n.id}/gelesen`);
    assert.equal((await anfrage(env, "STELLVERTRETER", "POST", "/api/konto/aktiv")).statusCode, 204);

    const p = postfach();
    const r = await mailRueckfallSenden({ jetzt: new Date(Date.now() + MAIL_WARTEZEIT_MS + 1000), senden: p.senden });
    assert.equal(p.mails.length, 0);
    assert.equal(r.entfallen, 2);
  });

  test("höchstens eine Mail pro Stunde – Späteres kommt in die nächste", async () => {
    const p = postfach();
    const start = Date.now();
    await neueAufgabe("VORSITZ", "MITGLIED");
    await mailRueckfallSenden({ jetzt: new Date(start + MAIL_WARTEZEIT_MS + 1000), senden: p.senden });
    assert.equal(p.mails.length, 1);

    await neueAufgabe("VORSITZ", "MITGLIED");
    await mailRueckfallSenden({ jetzt: new Date(start + 2 * MAIL_WARTEZEIT_MS + 1000), senden: p.senden });
    assert.equal(p.mails.length, 1, "innerhalb der Stunde wartet die zweite");

    await mailRueckfallSenden({ jetzt: new Date(start + MAIL_WARTEZEIT_MS + MAIL_ABSTAND_MS + 2000), senden: p.senden });
    assert.equal(p.mails.length, 2);
  });
});
