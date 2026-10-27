/**
 * Mail-Signaturen: mehrere benannte Signaturen, Standard je Mailart, Wahl beim Versand,
 * Übernahme der früheren Einzelsignatur. Versand selbst braucht SMTP – getestet wird,
 * welcher Text je Mailart herauskommt (lib/signaturen.ts → signaturText).
 */

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { anfrage, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";
import { MAIL_SIGNATUR_ALT, MAIL_SIGNATUREN, MAIL_SIGNATUR_STANDARD, signaturText } from "../src/lib/signaturen.js";

let env: TestUmgebung;

before(async () => { env = await starteTestumgebung(); });
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.systemEinstellung.deleteMany({ where: { schluessel: { in: [MAIL_SIGNATUR_ALT, MAIL_SIGNATUREN, MAIL_SIGNATUR_STANDARD] } } });
});

const mailSpeichern = (body: object) =>
  anfrage(env, "VORSITZ", "PUT", "/api/einstellungen/mail", { absenderName: "BR", absenderAdresse: "", ...body });

const MIT_LINK = { id: "mitglieder", name: "Mitglieder", text: "Betriebsrat\nEinwahl: https://meet.example/123" };
const OHNE_LINK = { id: "gaeste", name: "Gäste", text: "Betriebsrat Nordwerk" };

describe("Signaturen", () => {
  test("alte Einzelsignatur wird zu „Standard“ und gilt wie bisher für alle Mailarten", async () => {
    await prisma.systemEinstellung.create({ data: { schluessel: MAIL_SIGNATUR_ALT, wert: "Betriebsrat · Raum 104" } });
    const r = (await anfrage(env, "VORSITZ", "GET", "/api/einstellungen/signaturen")).json();
    assert.deepEqual(r.signaturen, [{ id: "standard", name: "Standard", text: "Betriebsrat · Raum 104" }]);
    assert.deepEqual(r.signaturStandard, { einladung: "standard", gast: "standard", empfang: "standard" });
    for (const art of ["einladung", "gast", "empfang"] as const) assert.equal(await signaturText(art), "Betriebsrat · Raum 104");
  });

  test("ohne jede Signatur: keine", async () => {
    assert.equal(await signaturText("einladung"), null);
    assert.deepEqual((await anfrage(env, "VORSITZ", "GET", "/api/einstellungen/signaturen")).json().signaturen, []);
  });

  test("Standard je Mailart; Wahl beim Versand überschreibt, leer = bewusst keine", async () => {
    const res = await mailSpeichern({
      signaturen: [MIT_LINK, OHNE_LINK],
      signaturStandard: { einladung: "mitglieder", gast: "gaeste", empfang: "" },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.match((await signaturText("einladung"))!, /Einwahl/);
    assert.equal(await signaturText("gast"), "Betriebsrat Nordwerk");
    assert.equal(await signaturText("empfang"), null);

    // Gäste dürfen nie den Link aus der Mitglieder-Signatur bekommen – es sei denn, jemand wählt ihn bewusst
    assert.ok(!(await signaturText("gast"))!.includes("https://"));
    assert.equal(await signaturText("einladung", ""), null);
    assert.equal(await signaturText("empfang", "gaeste"), "Betriebsrat Nordwerk");
    assert.equal(await signaturText("einladung", "gibt-es-nicht"), null);
  });

  test("gespeicherte Signaturen ersetzen die alte; Lesen liefert sie zurück", async () => {
    await prisma.systemEinstellung.create({ data: { schluessel: MAIL_SIGNATUR_ALT, wert: "alt" } });
    await mailSpeichern({ signaturen: [OHNE_LINK], signaturStandard: { einladung: "gaeste", gast: "gaeste", empfang: "" } });
    const m = (await anfrage(env, "VORSITZ", "GET", "/api/einstellungen/mail")).json();
    assert.deepEqual(m.signaturen, [OHNE_LINK]);
    assert.equal(m.signaturStandard.einladung, "gaeste");
    assert.equal(typeof m.standard, "string"); // Standard-Absenderadresse bleibt unberührt
    await mailSpeichern({ signaturen: [], signaturStandard: {} });
    assert.equal(await signaturText("einladung"), null, "leere Liste schaltet die alte Signatur nicht wieder ein");
  });

  test("Eingabe wird geprüft", async () => {
    const standard = { einladung: "", gast: "", empfang: "" };
    for (const [signaturen, signaturStandard] of [
      [[{ id: "a", name: "", text: "x" }], standard],                                           // ohne Namen
      [[{ id: "a", name: "Eins", text: "x" }, { id: "b", name: "eins", text: "y" }], standard], // Name doppelt
      [[{ id: "a", name: "Eins", text: "x" }, { id: "a", name: "Zwei", text: "y" }], standard], // ID doppelt
      [[{ id: "a b", name: "Eins", text: "x" }], standard],                                     // ungültige ID
      [[{ id: "a", name: "Eins", text: "x" }], { ...standard, gast: "fehlt" }],                 // Standard unbekannt
    ] as const) {
      assert.equal((await mailSpeichern({ signaturen, signaturStandard })).statusCode, 400, JSON.stringify(signaturen));
    }
  });

  test("Auswahlliste für die Versanddialoge: Vorsitz/Stellvertretung ja, Mitglied nein", async () => {
    assert.equal((await anfrage(env, "STELLVERTRETER", "GET", "/api/einstellungen/signaturen")).statusCode, 200);
    assert.equal((await anfrage(env, "MITGLIED", "GET", "/api/einstellungen/signaturen")).statusCode, 403);
  });
});
