/**
 * Standard-Einwahllinks für Videositzungen: Sitzungslink (Mitglieder) wird beim Umstellen der
 * Sitzungsform in die Sitzung kopiert; der Gästelink ist ein eigener Raum und der Sitzungslink
 * landet nie in einer Gästemail. Echte Mails gehen hier nie raus.
 */

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { SitzungForm, SitzungStatus } from "@prisma/client";
import { gastEinwahl, VIDEO_GAESTE_LINK, VIDEO_STANDARD_LINK } from "../src/lib/videoSitzung.js";
import { anfrage, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";

let env: TestUmgebung;

before(async () => { env = await starteTestumgebung(); });
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.geschaeftsordnung.deleteMany();
  await prisma.systemEinstellung.deleteMany({ where: { schluessel: { in: [VIDEO_STANDARD_LINK, VIDEO_GAESTE_LINK] } } });
});

const SITZUNGSLINK = "https://meet.example/sitzung";
const GAESTELINK   = "https://meet.example/gaeste";

const links = (body: object) => anfrage(env, "VORSITZ", "PUT", "/api/einstellungen/video", body);
const goMitVideo = (erlaubt: boolean) =>
  prisma.geschaeftsordnung.create({ data: { beschlossenAm: new Date(), erstelltVonId: env.ids.VORSITZ, videoErlaubt: erlaubt } });
const sitzungAnlegen = (einwahlLink: string | null = null) =>
  prisma.sitzung.create({
    data: { titel: "Sitzung", sitzungsdatum: new Date(Date.now() + 7 * 864e5), status: SitzungStatus.ENTWURF, erstelltVonId: env.ids.VORSITZ, einwahlLink },
  });
const formSetzen = (id: string, body: object) => anfrage(env, "VORSITZ", "PATCH", `/api/sitzungen/${id}`, body);

describe("Standard-Einwahllinks (Einstellungen)", () => {
  test("speichern und lesen; Mitglieder dürfen weder lesen noch schreiben", async () => {
    await goMitVideo(true);
    assert.equal((await links({ sitzungLink: SITZUNGSLINK, gaesteLink: GAESTELINK })).statusCode, 200);
    const v = (await anfrage(env, "STELLVERTRETER", "GET", "/api/einstellungen/video")).json();
    assert.deepEqual(v, { sitzungLink: SITZUNGSLINK, gaesteLink: GAESTELINK, goErlaubt: true });
    assert.equal((await anfrage(env, "MITGLIED", "GET", "/api/einstellungen/video")).statusCode, 403);
    assert.equal((await anfrage(env, "MITGLIED", "PUT", "/api/einstellungen/video", { sitzungLink: SITZUNGSLINK })).statusCode, 403);
  });

  test("Eingabe wird geprüft: nur http(s), Gästelink ≠ Sitzungslink", async () => {
    assert.equal((await links({ sitzungLink: "meet.example/x", gaesteLink: "" })).statusCode, 400);
    assert.equal((await links({ sitzungLink: SITZUNGSLINK, gaesteLink: SITZUNGSLINK })).statusCode, 400);
    assert.equal((await links({ sitzungLink: "", gaesteLink: "" })).statusCode, 200, "beide leer ist erlaubt");
  });
});

describe("Sitzungslink wird in die Sitzung kopiert", () => {
  test("Umstellen auf Zuschaltung: Standardlink wird eingetragen, wenn die GO es erlaubt", async () => {
    await goMitVideo(true);
    await links({ sitzungLink: SITZUNGSLINK, gaesteLink: GAESTELINK });
    const s = await sitzungAnlegen();
    const res = await formSetzen(s.id, { form: "ZUSCHALTUNG" });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().einwahlLink, SITZUNGSLINK);

    // Später geänderter Standard ändert die bestehende Sitzung nicht
    await links({ sitzungLink: "https://meet.example/neu", gaesteLink: GAESTELINK });
    assert.equal((await prisma.sitzung.findUniqueOrThrow({ where: { id: s.id } })).einwahlLink, SITZUNGSLINK);
  });

  test("eigener Link der Sitzung bleibt; Präsenz bekommt keinen; ohne GO-Erlaubnis geht es gar nicht", async () => {
    await goMitVideo(true);
    await links({ sitzungLink: SITZUNGSLINK, gaesteLink: GAESTELINK });

    const eigen = await sitzungAnlegen("https://meet.example/eigener-raum");
    assert.equal((await formSetzen(eigen.id, { form: "VIDEO" })).json().einwahlLink, "https://meet.example/eigener-raum");

    const praesenz = await sitzungAnlegen();
    const r = await formSetzen(praesenz.id, { form: "PRAESENZ", einwahlLink: null });
    assert.equal(r.json().einwahlLink, null);

    await prisma.geschaeftsordnung.deleteMany();
    await goMitVideo(false);
    const s = await sitzungAnlegen();
    assert.equal((await formSetzen(s.id, { form: "VIDEO" })).statusCode, 409);
  });

  test("ohne Standardlink bleibt das Feld leer", async () => {
    await goMitVideo(true);
    const s = await sitzungAnlegen();
    assert.equal((await formSetzen(s.id, { form: "ZUSCHALTUNG" })).json().einwahlLink, null);
  });
});

describe("Gästelink", () => {
  const offen = { zuschaltungGesperrt: false };

  test("nur bei virtueller Sitzung und nicht bei gesperrter Zuschaltung", () => {
    assert.equal(gastEinwahl({ form: SitzungForm.PRAESENZ, ...offen }, undefined, GAESTELINK), null);
    assert.equal(gastEinwahl({ form: SitzungForm.ZUSCHALTUNG, zuschaltungGesperrt: true }, undefined, GAESTELINK), null);
    assert.equal(gastEinwahl({ form: SitzungForm.ZUSCHALTUNG, ...offen }, undefined, GAESTELINK), GAESTELINK);
    assert.equal(gastEinwahl({ form: SitzungForm.VIDEO, ...offen }, undefined, GAESTELINK), GAESTELINK);
  });

  test("Eingabe überschreibt, leer = bewusst kein Link; ohne Gästelink nie der Sitzungslink", () => {
    assert.equal(gastEinwahl({ form: SitzungForm.VIDEO, ...offen }, "https://meet.example/anders", GAESTELINK), "https://meet.example/anders");
    assert.equal(gastEinwahl({ form: SitzungForm.VIDEO, ...offen }, "", GAESTELINK), null);
    // Es gibt gar keinen Weg, den Sitzungslink hineinzureichen: ohne Gästelink kommt nichts heraus
    assert.equal(gastEinwahl({ form: SitzungForm.VIDEO, ...offen }, undefined, ""), null);
  });
});
