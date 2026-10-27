/**
 * Zugang bestätigen (lib/zugang.ts): vorläufige Fristen beim Import, Vorschau,
 * Neuberechnung ab bestätigtem Zugang, unpassende § 102-Frist fällt weg.
 * Meldung neuer Eingänge an Vorsitz/Stellvertretung über die Benachrichtigungen (lib/eingangMeldung.ts),
 * Empfangsbestätigung an den Arbeitgeber (lib/empfangsbestaetigung.ts),
 * Sitzungsvorschlag vor Fristende (lib/sitzungsvorschlag.ts).
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { AuditAktion, FristStatus, Kategorie, Prisma, SitzungStatus } from "@prisma/client";
import { verarbeiteDokument } from "../src/services/dokument-pipeline.service.js";
import { zugangVorschlag } from "../src/lib/zugang.js";
import { eingangEmpfaenger } from "../src/lib/eingangMeldung.js";
import { MAIL_WARTEZEIT_MS, mailRueckfallSenden } from "../src/lib/benachrichtigung.js";
import { benachrichtigungMailInhalt } from "../src/lib/mailer.js";
import { entwurf } from "../src/lib/empfangsbestaetigung.js";
import { sitzungsvorschlag } from "../src/lib/sitzungsvorschlag.js";
import { anfrage, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";

let env: TestUmgebung;

before(async () => {
  env = await starteTestumgebung();
  const res = await anfrage(env, "VORSITZ", "PUT", "/api/einstellungen/feiertage", { bundesland: "NW", zusatz: [] });
  assert.equal(res.statusCode, 200, res.body);
});
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});

function anhoerung102(titel: string) {
  return verarbeiteDokument({
    stream:            Readable.from(Buffer.from("Anhörung zur Kündigung")),
    originalDateiname: `${titel}.txt`,
    mimetype:          "text/plain",
    userId:            env.ids.VORSITZ,
    metadata:          { titel, kategorie: Kategorie.ANHOERUNG_102, inboxQuelle: "WATCHFOLDER" },
  });
}

// Nach Name sortiert (orderBy typ sortiert in Enum-Reihenfolge)
const offeneFristen = async (dokumentId: string) =>
  (await prisma.frist.findMany({ where: { dokumentId, status: FristStatus.OFFEN } }))
    .sort((a, b) => a.typ.localeCompare(b.typ));

describe("Zugangsvorschlag", () => {
  const eingang = new Date("2026-10-14T10:00:00Z");

  test("ohne E-Mail: Eingang im System", () => {
    assert.equal(zugangVorschlag(eingang).toISOString(), eingang.toISOString());
  });

  test("E-Mail: Sendedatum, wenn es vor dem Eingang liegt", () => {
    assert.equal(zugangVorschlag(eingang, "2026-10-13T16:30:00Z").toISOString(), "2026-10-13T16:30:00.000Z");
  });

  test("E-Mail-Datum in der Zukunft oder kaputt: Eingang", () => {
    assert.equal(zugangVorschlag(eingang, "2026-10-20T08:00:00Z").toISOString(), eingang.toISOString());
    assert.equal(zugangVorschlag(eingang, "kein Datum").toISOString(), eingang.toISOString());
  });
});

describe("§ 102: Kündigungsart beim Bestätigen gewechselt", () => {
  test("Ordner sagt ordentlich, tatsächlich außerordentlich → 3-Tage-Frist wird angelegt", async () => {
    const dok = await verarbeiteDokument({
      stream:            Readable.from(Buffer.from("Anhörung zur fristlosen Kündigung")),
      originalDateiname: "AUSSERORDENTLICH.txt",
      mimetype:          "text/plain",
      userId:            env.ids.VORSITZ,
      metadata:          { kategorie: Kategorie.ANHOERUNG_102, kuendigungsArt: "ORDENTLICH", inboxQuelle: "WATCHFOLDER" },
    });
    assert.deepEqual((await offeneFristen(dok.id)).map(f => f.typ), ["ANHOERUNG_102_ORDENTLICH"]);

    // Mittwoch + 3 Tage = Samstag 03.10. (auch Feiertag) → Montag 05.10.
    const res = await anfrage(env, "VORSITZ", "POST", `/api/dokumente/${dok.id}/zugang`, {
      zugangAm: "2026-09-30T08:30:00Z", kuendigungsArt: "AUSSERORDENTLICH",
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual((await offeneFristen(dok.id)).map(f => [f.typ, f.faelligAm.toISOString()]),
      [["ANHOERUNG_102_AUSSERORDENTLICH", "2026-10-05T21:59:59.999Z"]]);
  });
});

describe("Zugang bestätigen (§ 102 ohne Kündigungsart)", () => {
  let id: string;

  before(async () => {
    id = (await anhoerung102("ZUGANG-102")).id;
  });

  test("Import: Zugang vorgeschlagen, beide § 102-Fristen vorläufig angelegt", async () => {
    const dok = await prisma.dokument.findUniqueOrThrow({ where: { id } });
    assert.ok(dok.zugangAm);
    assert.equal(dok.zugangBestaetigtAm, null);
    assert.deepEqual((await offeneFristen(id)).map(f => f.typ), ["ANHOERUNG_102_AUSSERORDENTLICH", "ANHOERUNG_102_ORDENTLICH"]);
  });

  test("Eingang liefert Zugang und offene Fristen mit", async () => {
    const res = await anfrage(env, "STELLVERTRETER", "GET", "/api/dokumente/inbox");
    const dok = (JSON.parse(res.body) as Array<{ id: string; zugangBestaetigtAm: string | null; fristen: unknown[] }>)
      .find(d => d.id === id);
    assert.ok(dok);
    assert.equal(dok.zugangBestaetigtAm, null);
    assert.equal(dok.fristen.length, 2);
  });

  test("Vorschau: Karfreitag bis Ostermontag verschoben, außerordentliche Frist entfällt", async () => {
    const res = await anfrage(env, "VORSITZ", "GET",
      `/api/dokumente/${id}/zugang?zugangAm=2026-03-27T09:00:00Z&kuendigungsArt=ORDENTLICH`);
    assert.equal(res.statusCode, 200, res.body);
    const { fristen } = JSON.parse(res.body) as { fristen: Array<{ typ: string; neuFaelligAm: string | null; verschoben: unknown[] }> };
    const ordentlich = fristen.find(f => f.typ === "ANHOERUNG_102_ORDENTLICH")!;
    assert.equal(ordentlich.neuFaelligAm, "2026-04-07T21:59:59.999Z");
    assert.equal(ordentlich.verschoben.length, 4);
    assert.equal(fristen.find(f => f.typ === "ANHOERUNG_102_AUSSERORDENTLICH")!.neuFaelligAm, null);
    // Vorschau speichert nichts
    assert.equal((await offeneFristen(id)).length, 2);
  });

  test("ohne Kündigungsart oder mit Zugang in der Zukunft: abgelehnt", async () => {
    const ohneArt = await anfrage(env, "VORSITZ", "POST", `/api/dokumente/${id}/zugang`, { zugangAm: "2026-03-27T09:00:00Z" });
    assert.equal(ohneArt.statusCode, 400);
    assert.match(ohneArt.body, /ordentliche oder außerordentliche/);

    const zukunft = new Date(Date.now() + 86_400_000).toISOString();
    const res = await anfrage(env, "VORSITZ", "POST", `/api/dokumente/${id}/zugang`, { zugangAm: zukunft, kuendigungsArt: "ORDENTLICH" });
    assert.equal(res.statusCode, 400);
  });

  test("Mitglied darf den Zugang nicht bestätigen", async () => {
    const res = await anfrage(env, "MITGLIED", "POST", `/api/dokumente/${id}/zugang`, { zugangAm: "2026-03-27T09:00:00Z", kuendigungsArt: "ORDENTLICH" });
    assert.equal(res.statusCode, 403);
  });

  test("Bestätigen: Frist ab Zugang neu, unpassende Frist weg, Vorgang und Audit-Log aktualisiert", async () => {
    const res = await anfrage(env, "STELLVERTRETER", "POST", `/api/dokumente/${id}/zugang`, {
      zugangAm: "2026-03-27T09:00:00Z", kuendigungsArt: "ORDENTLICH", unterlagenVollstaendig: false,
    });
    assert.equal(res.statusCode, 200, res.body);

    const fristen = await offeneFristen(id);
    assert.deepEqual(fristen.map(f => [f.typ, f.faelligAm.toISOString()]),
      [["ANHOERUNG_102_ORDENTLICH", "2026-04-07T21:59:59.999Z"]]);

    const dok = await prisma.dokument.findUniqueOrThrow({ where: { id }, include: { anhoerungsVorgang: true } });
    assert.equal(dok.zugangAm?.toISOString(), "2026-03-27T09:00:00.000Z");
    assert.ok(dok.zugangBestaetigtAm);
    assert.equal(dok.zugangBestaetigtVonId, env.ids.STELLVERTRETER);
    assert.equal(dok.unterlagenVollstaendig, false);
    assert.equal(dok.anhoerungsVorgang?.kuendigungsArt, "ORDENTLICH");

    assert.equal(await prisma.auditLog.count({ where: { dokumentId: id, aktion: AuditAktion.ZUGANG_BESTAETIGT } }), 1);
  });

  test("Korrektur: erneutes Bestätigen rechnet wieder ab dem neuen Zugang", async () => {
    // Donnerstag + 1 Woche, kein Feiertag dazwischen
    const res = await anfrage(env, "VORSITZ", "POST", `/api/dokumente/${id}/zugang`, { zugangAm: "2026-10-08T07:00:00Z" });
    assert.equal(res.statusCode, 200, res.body);
    const [frist] = await offeneFristen(id);
    assert.equal(frist?.faelligAm.toISOString(), "2026-10-15T21:59:59.999Z");
  });
});

describe("Meldung neuer Eingänge (Benachrichtigungen)", () => {
  const neu = (titel: string, kategorie: Kategorie, userId: string, inboxQuelle: string) => verarbeiteDokument({
    stream: Readable.from(Buffer.from(titel)), originalDateiname: `${titel}.txt`, mimetype: "text/plain",
    userId, metadata: { titel, kategorie, inboxQuelle },
  });
  /** Die Meldung läuft im Hintergrund – kurz auf sie warten */
  const meldungen = async (konto: "VORSITZ" | "STELLVERTRETER", titel: string) => {
    for (let i = 0; i < 40; i++) {
      const n = await prisma.nachricht.findMany({ where: { empfaengerId: env.ids[konto], art: { not: null }, betreff: { contains: titel } } });
      if (n.length) return n;
      await new Promise(r => setTimeout(r, 50));
    }
    return [];
  };
  const keine = async (konto: "VORSITZ" | "STELLVERTRETER", titel: string) => {
    await new Promise(r => setTimeout(r, 400));
    return (await prisma.nachricht.count({ where: { empfaengerId: env.ids[konto], art: { not: null }, betreff: { contains: titel } } })) === 0;
  };

  test("Watchfolder: Vorsitz und Stellvertretung; eigener Upload: nur die andere Person", async () => {
    const namen = async (d: { hochgeladenVonId: string; inboxQuelle: string | null }) =>
      (await eingangEmpfaenger(d)).map(e => e.id).sort();
    const beide = [env.ids.VORSITZ, env.ids.STELLVERTRETER].sort();
    assert.deepEqual(await namen({ hochgeladenVonId: env.ids.VORSITZ, inboxQuelle: "WATCHFOLDER" }), beide);
    assert.deepEqual(await namen({ hochgeladenVonId: env.ids.VORSITZ, inboxQuelle: "UPLOAD" }), [env.ids.STELLVERTRETER]);
    assert.deepEqual(await namen({ hochgeladenVonId: env.ids.MITGLIED, inboxQuelle: "UPLOAD" }), beide);
  });

  test("Fristsache: FRIST_EINGANG, Mail sofort fällig, Hinweis auf die Zugangsbestätigung", async () => {
    await neu("MELDUNG-FRIST", Kategorie.ANHOERUNG_99, env.ids.VORSITZ, "WATCHFOLDER");
    const [n] = await meldungen("VORSITZ", "MELDUNG-FRIST");
    assert.equal(n?.art, "FRIST_EINGANG");
    assert.equal(n?.link, "/eingang");
    assert.match(n!.inhalt, /Zugang bestätigen/);
    assert.equal(n!.mailFaelligAb!.getTime(), n!.erstelltAm.getTime());
  });

  test("übrige Eingänge: EINGANG, Mail erst nach 15 Minuten; eigener Upload nicht an sich selbst", async () => {
    await neu("MELDUNG-NORMAL", Kategorie.SONSTIGES, env.ids.VORSITZ, "UPLOAD");
    const [n] = await meldungen("STELLVERTRETER", "MELDUNG-NORMAL");
    assert.equal(n?.art, "EINGANG");
    assert.equal(n!.mailFaelligAb!.getTime() - n!.erstelltAm.getTime(), MAIL_WARTEZEIT_MS);
    assert.ok(await keine("VORSITZ", "MELDUNG-NORMAL"));
  });

  test("je Person abstellbar unter Mein Konto", async () => {
    await prisma.benutzer.update({ where: { id: env.ids.STELLVERTRETER }, data: { benachrichtigungen: { FRIST_EINGANG: "AUS", EINGANG: "AUS" } } });
    await neu("MELDUNG-AUS", Kategorie.ANHOERUNG_102, env.ids.MITGLIED, "UPLOAD");
    assert.equal((await meldungen("VORSITZ", "MELDUNG-AUS")).length, 1);
    assert.ok(await keine("STELLVERTRETER", "MELDUNG-AUS"));
    await prisma.benutzer.update({ where: { id: env.ids.STELLVERTRETER }, data: { benachrichtigungen: Prisma.DbNull } });
  });

  test("Mail: Fristsache geht sofort raus – auch bei Anwesenheit und trotz Stunden-Sperre, übrige nicht", async () => {
    await prisma.nachricht.deleteMany();
    const jetzt = new Date();
    const post: { email: string; arten: string[] }[] = [];
    const senden = async (email: string, _n: string, e: { art: string }[]) => { post.push({ email, arten: e.map(x => x.art) }); };
    const vorsitz = await prisma.benutzer.findUniqueOrThrow({ where: { id: env.ids.VORSITZ } });
    // Person war nach dem Eingang im System und hat vor Kurzem schon eine Mail bekommen
    await prisma.benutzer.update({ where: { id: vorsitz.id }, data: { zuletztAktiv: new Date(jetzt.getTime() + 1000) } });
    const basis = { empfaengerId: vorsitz.id, typ: "SYSTEM" as const, link: "/eingang", betreff: "x", inhalt: "x", erstelltAm: jetzt, mailFaelligAb: jetzt };
    await prisma.nachricht.create({ data: { ...basis, art: "AUFGABE_ZUGEWIESEN", mailGesendetAm: new Date(jetzt.getTime() - 60_000), mailFaelligAb: null } });
    await prisma.nachricht.create({ data: { ...basis, art: "EINGANG" } });
    await mailRueckfallSenden({ jetzt: new Date(jetzt.getTime() + 1000), senden });
    assert.equal(post.length, 0, "EINGANG darf bei Anwesenheit nicht rausgehen");

    await prisma.nachricht.create({ data: { ...basis, art: "FRIST_EINGANG" } });
    await mailRueckfallSenden({ jetzt: new Date(jetzt.getTime() + 1000), senden });
    assert.equal(post.length, 1);
    assert.ok(post[0].arten.some(a => /Fristsache/.test(a)));
  });

  test("Mail-Inhalt Fristsache: Fuß nennt die sofortige Meldung, Art als Titel maskiert", () => {
    const m = benachrichtigungMailInhalt("Sabine", [{ art: "Fristsache <eilig>", url: "http://br-dms.lokal/eingang", zeit: new Date("2026-10-14T13:05:00Z"), sofort: true }]);
    assert.match(m.text, /werden sofort gemeldet/);
    assert.match(m.html, /Fristsache &lt;eilig&gt;/);
    assert.doesNotMatch(m.html, /<eilig>/);
  });
});

describe("Empfangsbestätigung an den Arbeitgeber", () => {
  let id: string;

  before(async () => {
    id = (await anhoerung102("EMPFANG-102")).id;
    const res = await anfrage(env, "VORSITZ", "PUT", "/api/einstellungen/eingang-mails", { hrAdresse: "Personal@Firma.example" });
    assert.equal(res.statusCode, 200, res.body);
  });

  test("Entwurf: Zugang in deutscher Zeit, Unterzeichner, Hinweis bei unvollständigen Unterlagen", () => {
    const basis = {
      titel: "Anhörung Mustermann", kategorie: "§ 102 BetrVG – Kündigung", zugangAm: new Date("2026-09-30T08:30:00Z"),
      absender: { name: "Sabine Kröger", rolle: "VORSITZ" }, signatur: null,
    };
    const vollstaendig = entwurf({ ...basis, unterlagenVollstaendig: true });
    assert.equal(vollstaendig.betreff, "Empfangsbestätigung: Anhörung Mustermann");
    assert.match(vollstaendig.text, /zugegangen am Mi\., 30\.09\.2026, 10:30 Uhr/);
    assert.match(vollstaendig.text, /Sabine Kröger\nVorsitz des Betriebsrats/);
    assert.doesNotMatch(vollstaendig.text, /nicht vollständig/);
    assert.match(entwurf({ ...basis, unterlagenVollstaendig: false }).text, /noch nicht vollständig/);
  });

  test("ungültige HR-Adresse wird abgelehnt", async () => {
    const res = await anfrage(env, "VORSITZ", "PUT", "/api/einstellungen/eingang-mails", { hrAdresse: "keine adresse" });
    assert.equal(res.statusCode, 400);
  });

  test("vor bestätigtem Zugang: keine Empfangsbestätigung", async () => {
    const res = await anfrage(env, "VORSITZ", "GET", `/api/dokumente/${id}/empfangsbestaetigung`);
    assert.equal(res.statusCode, 409);
    assert.match(res.body, /Zugang/);
  });

  test("nach bestätigtem Zugang: Vorbelegung mit HR-Adresse und Text", async () => {
    await anfrage(env, "VORSITZ", "POST", `/api/dokumente/${id}/zugang`, {
      zugangAm: "2026-09-30T08:30:00Z", kuendigungsArt: "ORDENTLICH", unterlagenVollstaendig: false,
    });
    const res = await anfrage(env, "STELLVERTRETER", "GET", `/api/dokumente/${id}/empfangsbestaetigung`);
    assert.equal(res.statusCode, 200, res.body);
    const v = JSON.parse(res.body) as { an: string; text: string; gesendetAm: string | null };
    assert.equal(v.an, "personal@firma.example");
    assert.match(v.text, /Stellv\. Vorsitz des Betriebsrats/);
    assert.match(v.text, /noch nicht vollständig/);
    assert.equal(v.gesendetAm, null);
  });

  test("Senden prüft Adresse, Text und Mailserver; Mitglied darf nicht", async () => {
    const url = `/api/dokumente/${id}/empfangsbestaetigung`;
    const gueltig = { an: "personal@firma.example", betreff: "Empfangsbestätigung", text: "Bestätigt." };
    assert.equal((await anfrage(env, "MITGLIED", "POST", url, gueltig)).statusCode, 403);
    assert.match((await anfrage(env, "VORSITZ", "POST", url, { ...gueltig, an: "falsch" })).body, /gültige Empfängeradresse/);
    assert.match((await anfrage(env, "VORSITZ", "POST", url, { ...gueltig, text: "  " })).body, /nicht leer/);
    // In der Testumgebung gibt es keinen Mailserver
    const res = await anfrage(env, "VORSITZ", "POST", url, gueltig);
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /kein Mailserver/);
    assert.equal((await prisma.dokument.findUniqueOrThrow({ where: { id } })).empfangsbestaetigungAm, null);
  });
});

describe("Sitzungsvorschlag vor Fristende", () => {
  let id: string;
  const ids: Record<string, string> = {};
  const jetzt = new Date("2026-10-12T10:00:00Z");
  const sitzung = async (name: string, datum: string, status: SitzungStatus = SitzungStatus.ENTWURF, sitzungstyp = "ORDENTLICH") => {
    ids[name] = (await prisma.sitzung.create({
      data: { titel: `SV-${name}`, sitzungsdatum: new Date(datum), status, sitzungstyp, erstelltVonId: env.ids.VORSITZ },
    })).id;
  };

  before(async () => {
    id = (await anhoerung102("SITZUNGSVORSCHLAG-102")).id;
    // Zugang Montag 12.10. → ordentliche Kündigung: Fristende Montag 19.10., 24:00 Uhr
    await anfrage(env, "VORSITZ", "POST", `/api/dokumente/${id}/zugang`, { zugangAm: "2026-10-12T07:00:00Z", kuendigungsArt: "ORDENTLICH" });
    await sitzung("vorbei", "2026-10-09T09:00:00Z");
    await sitzung("abgesagt", "2026-10-13T09:00:00Z", SitzungStatus.ABGESAGT);
    await sitzung("versammlung", "2026-10-14T09:00:00Z", SitzungStatus.ENTWURF, "BETRIEBSVERSAMMLUNG");
    await sitzung("donnerstag", "2026-10-15T09:00:00Z");
    await sitzung("fristtag", "2026-10-19T14:00:00Z", SitzungStatus.TAGESORDNUNG_FIXIERT);
    await sitzung("zuSpaet", "2026-10-22T09:00:00Z");
    await sitzung("vielZuSpaet", "2026-10-29T09:00:00Z");
  });

  const titel = (v: { sitzungen: { id: string }[] }) => v.sitzungen.map(s => Object.keys(ids).find(k => ids[k] === s.id));

  test("nächste Sitzungen bis zur ersten nach Fristende; abgesagte, vergangene und Betriebsversammlungen fehlen", async () => {
    const v = (await sitzungsvorschlag(id, jetzt))!;
    assert.equal(v.fristende?.toISOString(), "2026-10-19T21:59:59.999Z");
    assert.deepEqual(titel(v), ["donnerstag", "fristtag", "zuSpaet"]);
    const [donnerstag, fristtag, zuSpaet] = v.sitzungen;
    assert.deepEqual([donnerstag!.rechtzeitig, donnerstag!.topMoeglich], [true, true]);
    assert.deepEqual([fristtag!.rechtzeitig, fristtag!.letzterTag, fristtag!.topMoeglich], [true, true, false]);
    assert.equal(zuSpaet!.rechtzeitig, false);
    assert.equal(v.sondersitzungNoetig, false);
    assert.match(v.vorschlagTitel, /SITZUNGSVORSCHLAG-102/);
  });

  test("Tagesordnung der einzigen rechtzeitigen Entwurfs-Sitzung fixiert → Sondersitzung nötig", async () => {
    await prisma.sitzung.update({ where: { id: ids.donnerstag }, data: { status: SitzungStatus.TAGESORDNUNG_FIXIERT } });
    assert.equal((await sitzungsvorschlag(id, jetzt))!.sondersitzungNoetig, true);
  });

  test("schon auf einem rechtzeitigen TOP → keine Warnung, Sitzung steht unter verknüpft", async () => {
    const top = await prisma.tOP.create({ data: { sitzungId: ids.fristtag!, nummer: 1, titel: "Anhörung" } });
    await prisma.topDokument.create({ data: { topId: top.id, dokumentId: id, verknuepftVonId: env.ids.VORSITZ } });
    const v = (await sitzungsvorschlag(id, jetzt))!;
    assert.deepEqual(v.verknuepft.map(s => [s.id, s.topNummer, s.rechtzeitig]), [[ids.fristtag, 1, true]]);
    assert.ok(!v.sitzungen.some(s => s.id === ids.fristtag));
    assert.equal(v.sondersitzungNoetig, false);
  });

  test("Route nur für Vorsitz/Stellvertretung", async () => {
    assert.equal((await anfrage(env, "MITGLIED", "GET", `/api/dokumente/${id}/sitzungsvorschlag`)).statusCode, 403);
    assert.equal((await anfrage(env, "STELLVERTRETER", "GET", `/api/dokumente/${id}/sitzungsvorschlag`)).statusCode, 200);
  });
});

describe("Fristenliste: vorläufig und Verschiebungsgrund", () => {
  type FristAntwort = { id: string; dokumentId: string | null; vorlaeufig: boolean; verschoben: { grund: string }[] };
  const liste = async () => JSON.parse((await anfrage(env, "MITGLIED", "GET", "/api/fristen")).body) as FristAntwort[];

  test("unbestätigt → vorläufig; bestätigt mit Verschiebung → Gründe; von Hand geändert → keine Gründe", async () => {
    const { id } = await anhoerung102("FRISTLISTE-102");
    assert.equal((await liste()).find(f => f.dokumentId === id)?.vorlaeufig, true);

    // Mittwoch 30.09. + 3 Tage = Samstag 03.10. (Tag der Deutschen Einheit) → Montag 05.10.
    await anfrage(env, "VORSITZ", "POST", `/api/dokumente/${id}/zugang`, { zugangAm: "2026-09-30T08:30:00Z", kuendigungsArt: "AUSSERORDENTLICH" });
    const frist = (await liste()).find(f => f.dokumentId === id)!;
    assert.equal(frist.vorlaeufig, false);
    assert.deepEqual(frist.verschoben.map(v => v.grund), ["Samstag (Tag der Deutschen Einheit)", "Sonntag"]);

    await prisma.frist.update({ where: { id: frist.id }, data: { faelligAm: new Date("2026-10-04T21:59:59.999Z") } });
    assert.deepEqual((await liste()).find(f => f.dokumentId === id)!.verschoben, []);
  });
});
