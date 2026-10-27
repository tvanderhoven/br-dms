/**
 * Aktivitäts-Feed (Dashboard „Was hat sich getan?“): zeigt neue Themen, Beiträge und
 * Kommentare – aber nur zu Objekten, die die lesende Person auch sonst sehen darf.
 */

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { anfrage, type Konto, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";

let env: TestUmgebung;

before(async () => { env = await starteTestumgebung(); });
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.kommentar.deleteMany();
  await prisma.thema.deleteMany();
  await prisma.aufgabe.deleteMany();
});

interface Eintrag { id: string; art: string; von: string | null; ziel: string; link: string | null }
const feed = async (konto: Konto) => (await anfrage(env, konto, "GET", "/api/aktivitaet")).json() as Eintrag[];

async function neuesThema(titel: string, vertraulichkeit: "ALLE" | "VORSITZ") {
  const res = await anfrage(env, "VORSITZ", "POST", "/api/themenakte", { titel, vertraulichkeit });
  assert.equal(res.statusCode, 201, res.body);
  return (res.json() as { id: string }).id;
}

describe("Aktivitäts-Feed", () => {
  test("neues Thema, Beitrag und Kommentar erscheinen mit Link und Autor", async () => {
    const id = await neuesThema("BV mobiles Arbeiten", "ALLE");
    const b = await anfrage(env, "VORSITZ", "POST", `/api/themenakte/${id}/eintraege`, { art: "NOTIZ", inhalt: "Vermerk" });
    assert.equal(b.statusCode, 201, b.body);
    await prisma.kommentar.create({
      data: { inhalt: "Rückfrage", autorId: env.ids.MITGLIED, themaEintragId: (b.json() as { id: string }).id },
    });

    const eintraege = await feed("MITGLIED");
    for (const art of ["THEMA", "THEMA_BEITRAG", "KOMMENTAR"]) {
      const e = eintraege.find(x => x.art === art);
      assert.ok(e, `${art} fehlt`);
      assert.equal(e.ziel, "BV mobiles Arbeiten");
      assert.equal(e.link, `/themenakte/${id}`);
    }
    assert.ok(eintraege.find(x => x.art === "KOMMENTAR")!.von, "Autor fehlt");
    // Inhalte der Beiträge und Kommentare stehen nicht im Feed
    assert.ok(!JSON.stringify(eintraege).includes("Rückfrage"));
    assert.ok(!JSON.stringify(eintraege).includes("Vermerk"));
  });

  test("Thema „nur Vorsitz“ samt Beiträgen und Kommentaren bleibt Mitgliedern verborgen", async () => {
    const id = await neuesThema("Personalie", "VORSITZ");
    const b = await anfrage(env, "VORSITZ", "POST", `/api/themenakte/${id}/eintraege`, { art: "NOTIZ", inhalt: "geheim" });
    await prisma.kommentar.create({
      data: { inhalt: "auch geheim", autorId: env.ids.VORSITZ, themaEintragId: (b.json() as { id: string }).id },
    });

    assert.ok((await feed("VORSITZ")).filter(e => e.ziel === "Personalie").length >= 3);
    assert.ok((await feed("STELLVERTRETER")).some(e => e.ziel === "Personalie"));
    for (const k of ["MITGLIED", "ERSATZMITGLIED"] as Konto[]) {
      assert.ok(!(await feed(k)).some(e => e.ziel === "Personalie"), k);
    }
  });

  test("Aufgaben: angelegt, bearbeitet und erledigt; private bleiben draußen", async () => {
    const lang = new Date(Date.now() - 3_600_000);
    const basis = { erstelltVonId: env.ids.VORSITZ, erstelltAm: lang, aktualisiertAm: lang };
    await prisma.aufgabe.create({ data: { ...basis, titel: "Nur angelegt" } });
    const b = await prisma.aufgabe.create({ data: { ...basis, titel: "Bearbeitet" } });
    const e = await prisma.aufgabe.create({ data: { ...basis, titel: "Erledigt" } });
    await prisma.aufgabe.create({ data: { ...basis, titel: "Privat", sichtbarkeit: "PRIVAT" } });
    // Bearbeiten über die API, damit aktualisiertAm wirklich gesetzt wird
    assert.equal((await anfrage(env, "VORSITZ", "PATCH", `/api/aufgaben/${b.id}`, { prioritaet: "HOCH" })).statusCode, 200);
    assert.equal((await anfrage(env, "VORSITZ", "PATCH", `/api/aufgaben/${e.id}`, { erledigt: true })).statusCode, 200);

    const eintraege = await feed("MITGLIED");
    const text = (titel: string) => eintraege.filter(x => x.ziel === titel).map(x => x.id.split("-")[0]);
    // neueste zuerst: die Änderung vor dem Anlegen
    assert.deepEqual(text("Bearbeitet"), ["ag", "a"]);
    assert.deepEqual(text("Erledigt"), ["ae", "a"]);
    assert.deepEqual(text("Nur angelegt"), ["a"]);
    assert.deepEqual(text("Privat"), []);
  });

  test("JAV, SBV und Externe kommen nicht an den Feed", async () => {
    for (const k of ["JAV", "SBV", "EXTERN"] as Konto[]) {
      assert.equal((await anfrage(env, k, "GET", "/api/aktivitaet")).statusCode, 403, k);
    }
  });
});
