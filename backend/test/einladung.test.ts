/**
 * Einladungsmail datensparsam (Roadmap, Paket 1): Detailstufe, neutraler TOP-Titel,
 * Abrufnachweis und die Ladungsprüfung vor einem Spontan-TOP.
 * Echte Mails gehen hier nie raus – geprüft wird, was in die Mail käme und was gespeichert wird.
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { AnwesenheitsStatus, EinladungDetail, SitzungStatus } from "@prisma/client";
import { einladungInhalt, titelInEinladung } from "../src/lib/einladungDetail.js";
import { ladungPruefen } from "../src/lib/ladungPruefen.js";
import { anfrage, type Konto, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";

let env: TestUmgebung;

before(async () => { env = await starteTestumgebung(); });
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});

const status = async (konto: Konto | null, methode: string, url: string, body?: unknown) =>
  (await anfrage(env, konto, methode, url, body)).statusCode;

const sitzungAnlegen = (titel: string, status: SitzungStatus = SitzungStatus.ENTWURF) =>
  prisma.sitzung.create({ data: { titel, sitzungsdatum: new Date(Date.now() + 7 * 864e5), status, erstelltVonId: env.ids.VORSITZ } });

describe("Inhalt der Einladungsmail je Detailstufe", () => {
  const tops = [
    { nummer: 1, titel: "Anhörung § 99 – Einstellung Frau Beispiel", einladungTitel: "Personelle Einzelmaßnahme § 99" },
    { nummer: 2, titel: "Kantine", einladungTitel: null },
  ];

  test("Vollständig: TOP-Liste mit neutralen Titeln und PDF", () => {
    const i = einladungInhalt(EinladungDetail.VOLLSTAENDIG, tops, true);
    assert.deepEqual(i.tops, [{ nummer: 1, titel: "Personelle Einzelmaßnahme § 99" }, { nummer: 2, titel: "Kantine" }]);
    assert.equal(i.mitPdf, true);
    assert.ok(!JSON.stringify(i.tops).includes("Frau Beispiel"), "echter Titel in der Mail");
  });

  test("Vollständig ohne vorhandenes PDF (oder für JAV/SBV): kein Anhang", () => {
    assert.equal(einladungInhalt(EinladungDetail.VOLLSTAENDIG, tops, false).mitPdf, false);
  });

  test("Nur TOP-Titel: Liste ohne PDF", () => {
    const i = einladungInhalt(EinladungDetail.NUR_TITEL, tops, true);
    assert.equal(i.tops?.length, 2);
    assert.equal(i.mitPdf, false);
  });

  test("Nur Link: weder TOPs noch PDF", () => {
    assert.deepEqual(einladungInhalt(EinladungDetail.NUR_LINK, tops, true), { tops: null, mitPdf: false });
  });

  test("leerer neutraler Titel zählt nicht", () => {
    assert.equal(titelInEinladung({ titel: "Echt", einladungTitel: "   " }), "Echt");
  });
});

describe("Voreinstellung der Detailstufe", () => {
  test("ohne Eintrag vollständig, Vorsitz stellt um, unbekannte Stufe abgewiesen", async () => {
    assert.equal((await anfrage(env, "VORSITZ", "GET", "/api/einstellungen/mail")).json().einladungDetail, "VOLLSTAENDIG");
    assert.equal(await status("VORSITZ", "PUT", "/api/einstellungen/mail", { einladungDetail: "ALLES" }), 400);
    const res = await anfrage(env, "STELLVERTRETER", "PUT", "/api/einstellungen/mail", { einladungDetail: "NUR_LINK" });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().einladungDetail, "NUR_LINK");

    const sitzung = await sitzungAnlegen("Voreinstellung");
    assert.equal((await anfrage(env, "MITGLIED", "GET", `/api/sitzungen/${sitzung.id}/einladung`)).json().detailStandard, "NUR_LINK");
  });

  test("ein älteres Formular ohne das Feld lässt die Voreinstellung stehen", async () => {
    assert.equal(await status("VORSITZ", "PUT", "/api/einstellungen/mail", { absenderName: "Betriebsrat" }), 200);
    assert.equal((await anfrage(env, "VORSITZ", "GET", "/api/einstellungen/mail")).json().einladungDetail, "NUR_LINK");
  });

  test("Versand mit unbekannter Detailstufe wird abgewiesen, bevor etwas rausgeht", async () => {
    const sitzung = await sitzungAnlegen("Versand", SitzungStatus.TAGESORDNUNG_FIXIERT);
    const vorher = process.env.SMTP_HOST;
    process.env.SMTP_HOST = "nicht-erreichbar.test";
    try {
      assert.equal(await status("VORSITZ", "POST", `/api/sitzungen/${sitzung.id}/einladung/versenden`, { detail: "ALLES" }), 400);
    } finally {
      if (vorher === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = vorher;
    }
    assert.equal(await prisma.einladungVersand.count({ where: { sitzungId: sitzung.id } }), 0);
  });
});

describe("Neutraler Titel am TOP", () => {
  test("im Entwurf setzen, ändern und leeren; nach der Fixierung gesperrt", async () => {
    const sitzung = await sitzungAnlegen("Neutral");
    const neu = await anfrage(env, "MITGLIED", "POST", `/api/sitzungen/${sitzung.id}/tops`, {
      titel: "Kündigung Herr Muster", einladungTitel: "  Personelle Einzelmaßnahme § 102 ",
    });
    assert.equal(neu.statusCode, 201, neu.body);
    const top = neu.json();
    assert.equal(top.einladungTitel, "Personelle Einzelmaßnahme § 102");

    const leer = await anfrage(env, "MITGLIED", "PATCH", `/api/sitzungen/${sitzung.id}/tops/${top.id}`, { einladungTitel: "" });
    assert.equal(leer.json().einladungTitel, null);

    await prisma.sitzung.update({ where: { id: sitzung.id }, data: { status: SitzungStatus.TAGESORDNUNG_FIXIERT } });
    assert.equal(await status("VORSITZ", "PATCH", `/api/sitzungen/${sitzung.id}/tops/${top.id}`, { einladungTitel: "x" }), 409);
  });
});

describe("Abrufnachweis", () => {
  test("erstes Öffnen nach erfolgreicher Einladung wird festgehalten, danach nicht überschrieben", async () => {
    const sitzung = await sitzungAnlegen("Abruf", SitzungStatus.TAGESORDNUNG_FIXIERT);
    const versand = (konto: Konto, erfolgreich: boolean) => prisma.einladungVersand.create({
      data: {
        sitzungId: sitzung.id, benutzerId: env.ids[konto], name: konto, adresse: `${konto}@test.lokal`, rolle: konto,
        erfolgreich, versendetVonId: env.ids.VORSITZ, versendetVon: "Vorsitz", detail: EinladungDetail.NUR_LINK,
      },
    });
    const ok = await versand("MITGLIED", true);
    const fehl = await versand("STELLVERTRETER", false);

    assert.equal(await status("MITGLIED", "GET", `/api/sitzungen/${sitzung.id}`), 200);
    const erster = (await prisma.einladungVersand.findUniqueOrThrow({ where: { id: ok.id } })).abgerufenAm;
    assert.ok(erster, "Abruf nicht festgehalten");

    await status("MITGLIED", "GET", `/api/sitzungen/${sitzung.id}`);
    assert.equal((await prisma.einladungVersand.findUniqueOrThrow({ where: { id: ok.id } })).abgerufenAm?.getTime(), erster.getTime());

    // Fehlgeschlagene Einladung und Öffnen durch andere zählen nicht
    await status("STELLVERTRETER", "GET", `/api/sitzungen/${sitzung.id}`);
    assert.equal((await prisma.einladungVersand.findUniqueOrThrow({ where: { id: fehl.id } })).abgerufenAm, null);

    const stand = (await anfrage(env, "VORSITZ", "GET", `/api/sitzungen/${sitzung.id}/einladung`)).json();
    assert.ok(stand.protokoll.find((p: { id: string }) => p.id === ok.id).abgerufenAm);
  });
});

describe("Ladungsprüfung vor einem Spontan-TOP", () => {
  test("meldet fehlende Ladung, fehlende Einladung und fehlenden Ersatz – dann vollständig", async () => {
    const sitzung = await sitzungAnlegen("Ladung", SitzungStatus.PROTOKOLL_ENTWURF);
    const id = sitzung.id;
    const laden = (konto: Konto, s: AnwesenheitsStatus, fuer?: Konto) =>
      prisma.anwesenheit.create({ data: { sitzungId: id, benutzerId: env.ids[konto], status: s, vertretungFuerId: fuer ? env.ids[fuer] : null } });
    const einladen = (konto: Konto) => prisma.einladungVersand.create({
      data: { sitzungId: id, benutzerId: env.ids[konto], name: konto, adresse: "x", rolle: konto, erfolgreich: true, versendetVonId: env.ids.VORSITZ, versendetVon: "V" },
    });

    await laden("VORSITZ", AnwesenheitsStatus.ANWESEND);
    await einladen("VORSITZ");
    await laden("MITGLIED", AnwesenheitsStatus.ABWESEND_ENTSCHULDIGT);
    // STELLVERTRETER fehlt in der Ladung ganz

    let p = (await ladungPruefen(id))!;
    assert.equal(p.vollstaendig, false);
    assert.deepEqual(p.maengel.map(m => m.grund).sort(), ["OHNE_ERSATZ", "OHNE_LADUNG"]);

    await laden("STELLVERTRETER", AnwesenheitsStatus.ANWESEND);
    await laden("ERSATZ_VERTRETUNG", AnwesenheitsStatus.ERSATZ_FUER, "MITGLIED");
    p = (await ladungPruefen(id))!;
    assert.deepEqual(p.maengel.map(m => m.grund).sort(), ["ERSATZ_OHNE_EINLADUNG", "OHNE_EINLADUNG"]);

    await einladen("STELLVERTRETER");
    await einladen("ERSATZ_VERTRETUNG");
    p = (await ladungPruefen(id))!;
    assert.equal(p.vollstaendig, true, JSON.stringify(p.maengel));

    // Route: nur Vorsitz/Stellvertretung (wie der Spontan-TOP selbst)
    assert.equal(await status("VORSITZ", "GET", `/api/sitzungen/${id}/ladung-pruefung`), 200);
    assert.equal(await status("MITGLIED", "GET", `/api/sitzungen/${id}/ladung-pruefung`), 403);
  });
});
