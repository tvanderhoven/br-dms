/**
 * Entgeltsystem der Eingruppierung (lib/entgelt.ts, routes/entgelt.ts):
 * Standard 1–6/1–4, Vorlagen, erlaubte Stufen je Gruppe, CSV-Auflösung.
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eingruppierungAufloesen, eingruppierungText, ladeEntgeltsystem } from "../src/lib/entgelt.js";
import { anfrage, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";

let env: TestUmgebung;
let maId: string;

type System = { gruppen: { id: string; nummer: number; bezeichnung: string; aktiv: boolean; stufen: number[] }[]; stufen: { id: string; nummer: number; bezeichnung: string }[] };
const system = async () => JSON.parse((await anfrage(env, "MITGLIED", "GET", "/api/entgelt")).body) as System & { vorlagen: { schluessel: string }[] };
const eintragen = (gruppe: number, stufe: number) =>
  anfrage(env, "VORSITZ", "POST", "/api/gehaltstabelle", { mitarbeiterId: maId, gruppe, stufe, gueltigAb: "2026-01-01" });

before(async () => {
  env = await starteTestumgebung();
  maId = (await prisma.mitarbeiter.create({ data: { vorname: "Eva", nachname: "Tarif" } })).id;
});
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});

describe("Entgeltsystem", () => {
  test("ohne Stammdaten: Standard Gruppe 1–6 / Stufe 1–4, Vorlagen werden angeboten", async () => {
    const s = await system();
    assert.deepEqual(s.gruppen.map(g => g.bezeichnung), ["Gruppe 1", "Gruppe 2", "Gruppe 3", "Gruppe 4", "Gruppe 5", "Gruppe 6"]);
    assert.deepEqual(s.stufen.map(x => x.bezeichnung), ["Stufe 1", "Stufe 2", "Stufe 3", "Stufe 4"]);
    assert.ok(s.vorlagen.some(v => v.schluessel === "tvoed"));
  });

  test("Eingruppierung wird gegen die Stammdaten geprüft", async () => {
    assert.equal((await eintragen(6, 4)).statusCode, 201);
    const zuHoch = await eintragen(7, 1);
    assert.equal(zuHoch.statusCode, 400);
    assert.match(zuHoch.body, /nicht angelegt/);
  });

  test("Vorlage nur ohne bestehende Eingruppierungen", async () => {
    const res = await anfrage(env, "VORSITZ", "POST", "/api/entgelt/vorlage", { schluessel: "tvoed" });
    assert.equal(res.statusCode, 409);
    assert.match(res.body, /Eingruppierung/);
  });

  test("TVöD-Vorlage: E 1 erlaubt nur Stufe 2–6", async () => {
    await prisma.gehaltsstufenEintrag.deleteMany();
    const res = await anfrage(env, "STELLVERTRETER", "POST", "/api/entgelt/vorlage", { schluessel: "tvoed" });
    assert.equal(res.statusCode, 200, res.body);
    const s = await system();
    assert.equal(s.gruppen.length, 15);
    assert.deepEqual(s.gruppen.find(g => g.bezeichnung === "E 1")?.stufen, [2, 3, 4, 5, 6]);

    const e1s1 = await eintragen(1, 1);
    assert.equal(e1s1.statusCode, 400);
    assert.match(e1s1.body, /E 1 hat keine Stufe 1/);
    assert.equal((await eintragen(1, 2)).statusCode, 201);
    assert.equal((await eintragen(9, 6)).statusCode, 201);
  });

  test("Gruppe ergänzen, umbenennen; benutzte Gruppe nicht löschbar, nur deaktivierbar", async () => {
    const neu = await anfrage(env, "VORSITZ", "POST", "/api/entgelt/gruppen", { bezeichnung: "E 9a", stufen: [1, 2, 3, 4, 5] });
    assert.equal(neu.statusCode, 201, neu.body);
    assert.equal((JSON.parse(neu.body) as { nummer: number }).nummer, 16);

    const e9 = (await system()).gruppen.find(g => g.bezeichnung === "E 9")!;
    assert.equal((await anfrage(env, "VORSITZ", "DELETE", `/api/entgelt/gruppen/${e9.id}`)).statusCode, 409);
    assert.equal((await anfrage(env, "VORSITZ", "PUT", `/api/entgelt/gruppen/${e9.id}`, { bezeichnung: "E 9b" })).statusCode, 200);

    await anfrage(env, "VORSITZ", "PUT", `/api/entgelt/gruppen/${e9.id}`, { aktiv: false });
    assert.equal((await eintragen(9, 1)).statusCode, 400);   // neu: deaktiviert
    const vorhandener = await prisma.gehaltsstufenEintrag.findFirstOrThrow({ where: { gruppe: 9 } });
    const bemerkung = await anfrage(env, "VORSITZ", "PUT", `/api/gehaltstabelle/${vorhandener.id}`, { gruppe: 9, stufe: 6, bemerkung: "unverändert" });
    assert.equal(bemerkung.statusCode, 200, bemerkung.body);   // bestehender Eintrag bleibt bearbeitbar
  });

  test("Mitglieder dürfen das Entgeltsystem nicht ändern", async () => {
    assert.equal((await anfrage(env, "MITGLIED", "POST", "/api/entgelt/gruppen", { bezeichnung: "X" })).statusCode, 403);
    assert.equal((await anfrage(env, "MITGLIED", "POST", "/api/entgelt/vorlage", { schluessel: "eg-1-17" })).statusCode, 403);
  });

  test("CSV-Auflösung und Anzeige", async () => {
    const s = await ladeEntgeltsystem();
    assert.deepEqual(eingruppierungAufloesen(s, "E 2", "3"), { gruppe: 2, stufe: 3 });
    assert.deepEqual(eingruppierungAufloesen(s, "e2", "Stufe 3"), { gruppe: 2, stufe: 3 });
    assert.deepEqual(eingruppierungAufloesen(s, "2", "3"), { gruppe: 2, stufe: 3 });
    assert.equal(eingruppierungAufloesen(s, "EG 99", "1"), null);
    assert.equal(eingruppierungText(s, 2, 3), "E 2 Stufe 3");
  });
});
