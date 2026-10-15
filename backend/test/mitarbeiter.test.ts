/**
 * Mitarbeiter: Zeitmodell laut Vertrag (Vorauswahl für neue Zeitmodell-Zeiträume).
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { anfrage, prisma, starteTestumgebung, UNBEKANNT, type TestUmgebung } from "./hilfe.js";

let env: TestUmgebung;
let maId: string, zmId: string;

before(async () => {
  env = await starteTestumgebung();
  maId = (await prisma.mitarbeiter.create({ data: { vorname: "Erika", nachname: "Vertrag" } })).id;
  zmId = (await prisma.zeitmodell.create({ data: { bezeichnung: "Vollzeit 40 h", wochenstunden: 40 } })).id;
});
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});

describe("Zeitmodell laut Vertrag", () => {
  test("Vorsitz setzt und entfernt es; die Liste liefert es mit", async () => {
    const res = await anfrage(env, "VORSITZ", "PATCH", `/api/mitarbeiter/${maId}`, { vertragsZeitmodellId: zmId });
    assert.equal(res.statusCode, 200, res.body);
    const liste = JSON.parse((await anfrage(env, "MITGLIED", "GET", "/api/mitarbeiter")).body) as { id: string; vertragsZeitmodellId: string | null }[];
    assert.equal(liste.find(m => m.id === maId)?.vertragsZeitmodellId, zmId);

    await anfrage(env, "STELLVERTRETER", "PATCH", `/api/mitarbeiter/${maId}`, { vertragsZeitmodellId: null });
    assert.equal((await prisma.mitarbeiter.findUniqueOrThrow({ where: { id: maId } })).vertragsZeitmodellId, null);
  });

  test("unbekanntes Zeitmodell → 404, Mitglied darf es nicht setzen", async () => {
    assert.equal((await anfrage(env, "VORSITZ", "PATCH", `/api/mitarbeiter/${maId}`, { vertragsZeitmodellId: UNBEKANNT })).statusCode, 404);
    assert.equal((await anfrage(env, "MITGLIED", "PATCH", `/api/mitarbeiter/${maId}`, { vertragsZeitmodellId: zmId })).statusCode, 403);
  });

  test("beim Anlegen mitgeben", async () => {
    const res = await anfrage(env, "VORSITZ", "POST", "/api/mitarbeiter", { vorname: "Max", nachname: "Neu", vertragsZeitmodellId: zmId });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal((JSON.parse(res.body) as { vertragsZeitmodellId: string }).vertragsZeitmodellId, zmId);
  });

  test("Zeitmodell gelöscht → Feld wird leer statt Fehler", async () => {
    const tmp = (await prisma.zeitmodell.create({ data: { bezeichnung: "Wegwerf" } })).id;
    await prisma.mitarbeiter.update({ where: { id: maId }, data: { vertragsZeitmodellId: tmp } });
    await prisma.zeitmodell.delete({ where: { id: tmp } });
    assert.equal((await prisma.mitarbeiter.findUniqueOrThrow({ where: { id: maId } })).vertragsZeitmodellId, null);
  });
});
