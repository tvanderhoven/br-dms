/**
 * Gäste je TOP (Roadmap Paket 5) und Sitzung per Video/Telefon (Roadmap Paket 6):
 * Gäste hängen am TOP und verschwinden mit ihm für JAV/SBV; Zuschaltung nur, wenn die
 * Geschäftsordnung sie erlaubt; ab einem Viertel Widersprüche gesperrt; Bestätigung nach § 34.
 * Echte Mails gehen hier nie raus.
 */

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { AnwesenheitsStatus, SitzungForm, SitzungStatus, Teilnahmeart } from "@prisma/client";
import { ortszeitJetzt, widerspruchSchwelle } from "../src/lib/videoSitzung.js";
import { anfrage, type Konto, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";

let env: TestUmgebung;

before(async () => { env = await starteTestumgebung(); });
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});

const status = async (konto: Konto | null, methode: string, url: string, body?: unknown) =>
  (await anfrage(env, konto, methode, url, body)).statusCode;

const sitzungAnlegen = (status: SitzungStatus = SitzungStatus.ENTWURF, daten: { form?: SitzungForm; widerspruchBis?: Date } = {}) =>
  prisma.sitzung.create({
    data: { titel: "Sitzung", sitzungsdatum: new Date(Date.now() + 7 * 864e5), status, erstelltVonId: env.ids.VORSITZ, ...daten },
  });

const topAnlegen = (sitzungId: string, vertraulich = false) =>
  prisma.tOP.create({ data: { sitzungId, nummer: 1, titel: "Anhörung § 99 – Frau Beispiel", einladungTitel: "Personelle Einzelmaßnahme", vertraulich } });

describe("Gäste je TOP", () => {
  test("Vorsitz trägt Gäste ein; Pflichtfelder und E-Mail werden geprüft", async () => {
    const s = await sitzungAnlegen();
    const top = await topAnlegen(s.id);
    const url = `/api/sitzungen/${s.id}/tops/${top.id}/gaeste`;

    assert.equal(await status("MITGLIED", "POST", url, { name: "Herr Personal", funktion: "ARBEITGEBER" }), 403);
    assert.equal(await status("VORSITZ", "POST", url, { funktion: "ARBEITGEBER" }), 400);
    assert.equal(await status("VORSITZ", "POST", url, { name: "X", funktion: "KAISER" }), 400);
    assert.equal(await status("VORSITZ", "POST", url, { name: "X", funktion: "SONSTIGE", email: "kein-mail" }), 400);

    const res = await anfrage(env, "VORSITZ", "POST", url, { name: " Herr Personal ", funktion: "ARBEITGEBER", organisation: "HR", email: "hr@firma.de" });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().name, "Herr Personal");

    const detail = (await anfrage(env, "MITGLIED", "GET", `/api/sitzungen/${s.id}`)).json();
    assert.equal(detail.tops[0].gaeste.length, 1);
  });

  test("Mitglied setzt im Protokoll „nicht erschienen“; nach dem Finalisieren gesperrt", async () => {
    const s = await sitzungAnlegen(SitzungStatus.PROTOKOLL_ENTWURF);
    const top = await topAnlegen(s.id);
    const gast = await prisma.topGast.create({ data: { topId: top.id, name: "Frau Gewerkschaft", funktion: "GEWERKSCHAFT" } });
    const url = `/api/sitzungen/${s.id}/tops/${top.id}/gaeste/${gast.id}`;

    const res = await anfrage(env, "MITGLIED", "PATCH", url, { anwesend: false });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().anwesend, false);

    await prisma.sitzung.update({ where: { id: s.id }, data: { status: SitzungStatus.PROTOKOLL_FINAL } });
    assert.equal(await status("MITGLIED", "PATCH", url, { anwesend: true }), 409);
    assert.equal(await status("VORSITZ", "DELETE", url), 409);
  });

  test("JAV/SBV sehen Gäste vertraulicher TOPs nicht", async () => {
    const s = await sitzungAnlegen(SitzungStatus.TAGESORDNUNG_FIXIERT);
    const top = await topAnlegen(s.id, true);
    await prisma.topGast.create({ data: { topId: top.id, name: "Geheimer Gast", funktion: "AUSKUNFTSPERSON" } });
    const body = (await anfrage(env, "JAV", "GET", `/api/sitzungen/${s.id}`)).body;
    assert.ok(!body.includes("Geheimer Gast"));
  });

  test("Gast eines anderen TOPs lässt sich nicht über fremde URL ändern", async () => {
    const s = await sitzungAnlegen();
    const top = await topAnlegen(s.id);
    const andere = await sitzungAnlegen();
    const andererTop = await topAnlegen(andere.id);
    const gast = await prisma.topGast.create({ data: { topId: andererTop.id, name: "Fremd", funktion: "SONSTIGE" } });
    assert.equal(await status("VORSITZ", "PATCH", `/api/sitzungen/${s.id}/tops/${top.id}/gaeste/${gast.id}`, { name: "Neu" }), 404);
    assert.equal(await status("VORSITZ", "DELETE", `/api/sitzungen/${s.id}/tops/${top.id}/gaeste/${gast.id}`), 404);
  });

  test("Einladen braucht einen Mailserver und eine Adresse", async () => {
    const s = await sitzungAnlegen();
    const top = await topAnlegen(s.id);
    const gast = await prisma.topGast.create({ data: { topId: top.id, name: "Ohne Mail", funktion: "SACHVERSTAENDIGER" } });
    const url = `/api/sitzungen/${s.id}/tops/${top.id}/gaeste/${gast.id}/einladen`;
    const smtp = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    assert.equal(await status("VORSITZ", "POST", url), 409);
    process.env.SMTP_HOST = "mail.invalid";
    assert.equal(await status("VORSITZ", "POST", url), 400);
    if (smtp === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = smtp;
  });
});

describe("Sitzung per Video/Telefon", () => {
  beforeEach(async () => { await prisma.geschaeftsordnung.deleteMany(); });

  const goMitVideo = (erlaubt: boolean) => prisma.geschaeftsordnung.create({
    data: { beschlossenAm: new Date(), erstelltVonId: env.ids.VORSITZ, videoErlaubt: erlaubt },
  });

  test("Schwelle: mindestens ein Viertel der Mitglieder", () => {
    assert.equal(widerspruchSchwelle(9), 3);
    assert.equal(widerspruchSchwelle(8), 2);
    assert.equal(widerspruchSchwelle(3), 1);
  });

  test("Form anders als Präsenz nur, wenn die Geschäftsordnung es erlaubt", async () => {
    const s = await sitzungAnlegen();
    const url = `/api/sitzungen/${s.id}`;
    assert.equal(await status("VORSITZ", "PATCH", url, { form: "ZUSCHALTUNG" }), 409);   // keine GO
    await goMitVideo(false);
    assert.equal(await status("VORSITZ", "PATCH", url, { form: "ZUSCHALTUNG" }), 409);
    await goMitVideo(true);
    assert.equal(await status("VORSITZ", "PATCH", url, { form: "ZUSCHALTUNG", einwahlLink: "ftp://x" }), 400);
    const res = await anfrage(env, "VORSITZ", "PATCH", url, { form: "ZUSCHALTUNG", einwahlLink: "https://meet.example/br" });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().form, "ZUSCHALTUNG");
    assert.equal(await status("VORSITZ", "PATCH", url, { form: "QUATSCH" }), 400);
  });

  test("Teilnahmeart: zugeschaltet nur bei passender Form; zurück zu Präsenz setzt alle auf vor Ort", async () => {
    await goMitVideo(true);
    const s = await sitzungAnlegen(SitzungStatus.TAGESORDNUNG_FIXIERT);
    const url = `/api/sitzungen/${s.id}/anwesenheit`;
    assert.equal(await status("VORSITZ", "POST", url, { benutzerId: env.ids.MITGLIED, status: "ANWESEND", teilnahmeart: "VIDEO" }), 409);

    await anfrage(env, "VORSITZ", "PATCH", `/api/sitzungen/${s.id}`, { form: "ZUSCHALTUNG" });
    const res = await anfrage(env, "VORSITZ", "POST", url, { benutzerId: env.ids.MITGLIED, status: "ANWESEND", teilnahmeart: "VIDEO" });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().teilnahmeart, "VIDEO");

    // Wer verhindert ist, ist nicht zugeschaltet
    const verhindert = await anfrage(env, "VORSITZ", "POST", url, { benutzerId: env.ids.MITGLIED, status: "ABWESEND_ENTSCHULDIGT" });
    assert.equal(verhindert.json().teilnahmeart, "VOR_ORT");

    await anfrage(env, "VORSITZ", "POST", url, { benutzerId: env.ids.MITGLIED, status: "ANWESEND", teilnahmeart: "TELEFON" });
    await anfrage(env, "VORSITZ", "PATCH", `/api/sitzungen/${s.id}`, { form: "PRAESENZ" });
    const a = await prisma.anwesenheit.findFirstOrThrow({ where: { sitzungId: s.id, benutzerId: env.ids.MITGLIED } });
    assert.equal(a.teilnahmeart, Teilnahmeart.VOR_ORT);
  });

  test("Widerspruch: nur Mitglieder und geladene Ersatzmitglieder, ab einem Viertel gesperrt", async () => {
    const s = await sitzungAnlegen(SitzungStatus.TAGESORDNUNG_FIXIERT, { form: SitzungForm.ZUSCHALTUNG });
    await prisma.anwesenheit.create({ data: { sitzungId: s.id, benutzerId: env.ids.STELLVERTRETER, status: AnwesenheitsStatus.ANWESEND, teilnahmeart: Teilnahmeart.VIDEO } });
    const url = `/api/sitzungen/${s.id}/widerspruch`;

    assert.equal(await status("ERSATZMITGLIED", "POST", url), 403);   // nicht geladen
    assert.equal(await status("JAV", "POST", url), 403);

    const vorher = (await anfrage(env, "MITGLIED", "GET", `/api/sitzungen/${s.id}/video`)).json();
    assert.equal(vorher.widerspruch.gesperrt, false);
    assert.equal(vorher.widerspruch.darf, true);
    assert.deepEqual(vorher.widerspruch.namen, [], "Namen sieht nur der Vorsitz");

    const res = await anfrage(env, "MITGLIED", "POST", url);
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().gesperrt, true);   // 3 Mitglieder → schon einer ist ein Viertel

    // Zugeschaltete stehen jetzt vor Ort, neue Zuschaltung geht nicht mehr
    const a = await prisma.anwesenheit.findFirstOrThrow({ where: { sitzungId: s.id, benutzerId: env.ids.STELLVERTRETER } });
    assert.equal(a.teilnahmeart, Teilnahmeart.VOR_ORT);
    assert.equal(await status("VORSITZ", "POST", `/api/sitzungen/${s.id}/anwesenheit`, { benutzerId: env.ids.VORSITZ, status: "ANWESEND", teilnahmeart: "VIDEO" }), 409);

    const vorsitz = (await anfrage(env, "VORSITZ", "GET", `/api/sitzungen/${s.id}/video`)).json();
    assert.equal(vorsitz.widerspruch.namen.length, 1);

    // Benachrichtigung an Vorsitz und Geladene
    const meldungen = await prisma.nachricht.count({ where: { sitzungId: s.id, art: "VIDEO_WIDERSPRUCH" } });
    assert.ok(meldungen >= 1);

    // Zurücknehmen hebt die Sperre auf
    const zurueck = await anfrage(env, "MITGLIED", "DELETE", url);
    assert.equal(zurueck.json().gesperrt, false);
  });

  test("geladenes Ersatzmitglied darf widersprechen; nach Fristende nicht mehr", async () => {
    const s = await sitzungAnlegen(SitzungStatus.TAGESORDNUNG_FIXIERT, { form: SitzungForm.VIDEO });
    await prisma.anwesenheit.create({ data: { sitzungId: s.id, benutzerId: env.ids.ERSATZMITGLIED, status: AnwesenheitsStatus.ERSATZ_FUER, vertretungFuerId: env.ids.MITGLIED } });
    assert.equal(await status("ERSATZMITGLIED", "POST", `/api/sitzungen/${s.id}/widerspruch`), 201);

    const abgelaufen = await sitzungAnlegen(SitzungStatus.TAGESORDNUNG_FIXIERT, {
      form: SitzungForm.ZUSCHALTUNG, widerspruchBis: new Date(ortszeitJetzt().getTime() - 60_000),
    });
    assert.equal(await status("MITGLIED", "POST", `/api/sitzungen/${abgelaufen.id}/widerspruch`), 409);

    const praesenz = await sitzungAnlegen(SitzungStatus.TAGESORDNUNG_FIXIERT);
    assert.equal(await status("MITGLIED", "POST", `/api/sitzungen/${praesenz.id}/widerspruch`), 409);
  });

  test("Teilnahme bestätigen: nur selbst, nur zugeschaltet, erst ab der Sitzung", async () => {
    const s = await sitzungAnlegen(SitzungStatus.TAGESORDNUNG_FIXIERT, { form: SitzungForm.ZUSCHALTUNG });
    await prisma.anwesenheit.create({ data: { sitzungId: s.id, benutzerId: env.ids.MITGLIED, status: AnwesenheitsStatus.ANWESEND, teilnahmeart: Teilnahmeart.VIDEO } });
    await prisma.anwesenheit.create({ data: { sitzungId: s.id, benutzerId: env.ids.VORSITZ, status: AnwesenheitsStatus.ANWESEND } });
    const url = `/api/sitzungen/${s.id}/teilnahme-bestaetigen`;

    assert.equal(await status("MITGLIED", "POST", url), 409);   // Sitzung liegt in der Zukunft

    // Protokoll starten → Erinnerung an die Zugeschalteten
    assert.equal(await status("VORSITZ", "POST", `/api/sitzungen/${s.id}/protokoll`), 200);
    assert.equal(await prisma.nachricht.count({ where: { sitzungId: s.id, art: "TEILNAHME_BESTAETIGEN", empfaengerId: env.ids.MITGLIED } }), 1);

    assert.equal(await status("VORSITZ", "POST", url), 409);    // vor Ort
    const res = await anfrage(env, "MITGLIED", "POST", url);
    assert.equal(res.statusCode, 201, res.body);
    const a = await prisma.anwesenheit.findFirstOrThrow({ where: { sitzungId: s.id, benutzerId: env.ids.MITGLIED } });
    assert.ok(a.teilnahmeBestaetigtAm);

    // Wechsel der Teilnahmeart verwirft die Bestätigung
    await anfrage(env, "VORSITZ", "POST", `/api/sitzungen/${s.id}/anwesenheit`, { benutzerId: env.ids.MITGLIED, status: "ANWESEND", teilnahmeart: "TELEFON" });
    const b = await prisma.anwesenheit.findFirstOrThrow({ where: { sitzungId: s.id, benutzerId: env.ids.MITGLIED } });
    assert.equal(b.teilnahmeBestaetigtAm, null);
  });

  test("PDFs: Gäste, Teilnahmeart, Vermerk § 30 Abs. 2 und Anlage § 34", async () => {
    const s = await sitzungAnlegen(SitzungStatus.PROTOKOLL_ENTWURF, { form: SitzungForm.ZUSCHALTUNG });
    const top = await prisma.tOP.create({ data: { sitzungId: s.id, nummer: 1, titel: "Kantine" } });
    await prisma.topGast.create({ data: { topId: top.id, name: "Petra Personal", funktion: "ARBEITGEBER", organisation: "HR" } });
    await prisma.topGast.create({ data: { topId: top.id, name: "Nicht Erschienen", funktion: "SONSTIGE", anwesend: false } });
    await prisma.anwesenheit.create({ data: { sitzungId: s.id, benutzerId: env.ids.VORSITZ, status: AnwesenheitsStatus.ANWESEND } });
    await prisma.anwesenheit.create({
      data: { sitzungId: s.id, benutzerId: env.ids.MITGLIED, status: AnwesenheitsStatus.ANWESEND, teilnahmeart: Teilnahmeart.VIDEO, teilnahmeBestaetigtAm: new Date() },
    });
    await prisma.anwesenheit.create({ data: { sitzungId: s.id, benutzerId: env.ids.STELLVERTRETER, status: AnwesenheitsStatus.ANWESEND, teilnahmeart: Teilnahmeart.TELEFON } });
    await prisma.sitzungVersion.create({ data: { sitzungId: s.id, versionNummer: "2.0", typ: "PROTOKOLL_ENTWURF", readonly: false, erstelltVonId: env.ids.VORSITZ } });

    const { PDFParse } = await import("pdf-parse");
    const pdfText = async (methode: string, url: string) => {
      const res = await anfrage(env, "VORSITZ", methode, url);
      assert.equal(res.statusCode, 200, res.body.slice(0, 200));
      // Zeilenumbrüche des Satzes einebnen, damit die Prüfung nicht am Layout hängt
      return (await new PDFParse({ data: res.rawPayload }).getText()).text.replace(/\s+/g, " ");
    };

    const protokoll = await pdfText("POST", `/api/sitzungen/${s.id}/pdf/2.0`);
    assert.match(protokoll, /Gäste \(1\)/);
    assert.match(protokoll, /Petra Personal \(Arbeitgeber, HR\) zu TOP 1/);
    assert.doesNotMatch(protokoll, /Nicht Erschienen/);
    assert.match(protokoll, /Test MITGLIED \(Mitglied\) – per Video/);
    assert.match(protokoll, /nach § 30 Abs\. 2 BetrVG/);
    assert.match(protokoll, /Bestätigung der Teilnahme per Video\/Telefon \(§ 34 Abs\. 1 BetrVG\)/);
    assert.match(protokoll, /Test MITGLIED \(per Video\): bestätigt in BR-DMS am/);
    assert.match(protokoll, /Test STELLVERTRETER \(per Telefon\): noch nicht bestätigt/);

    const liste = await pdfText("GET", `/api/sitzungen/${s.id}/anwesenheitsliste`);
    assert.match(liste, /per Video – Bestätigung in Textform/);
    assert.match(liste, /per Telefon – Bestätigung in Textform/);
    assert.match(liste, /Petra Personal/);
    assert.match(liste, /zu TOP 1/);
  });

  test("Geschäftsordnung speichert die Regeln", async () => {
    const res = await anfrage(env, "VORSITZ", "POST", "/api/geschaeftsordnung", {
      beschlossenAm: "2026-01-15", videoErlaubt: true, videoNichtVertraulich: true, videoBedingungen: " nur mit Kamera ",
    });
    assert.equal(res.statusCode, 201, res.body);
    const go = res.json();
    assert.equal(go.videoErlaubt, true);
    assert.equal(go.videoNichtVertraulich, true);
    assert.equal(go.videoBedingungen, "nur mit Kamera");

    const aus = await anfrage(env, "VORSITZ", "PUT", `/api/geschaeftsordnung/${go.id}`, { videoErlaubt: false, videoNichtVertraulich: true });
    assert.equal(aus.json().videoNichtVertraulich, false, "ohne Zuschaltung keine Sonderregel");
  });
});
