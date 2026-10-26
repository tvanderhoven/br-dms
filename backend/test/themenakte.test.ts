/**
 * Themenakte: Sichtbarkeit nach Vertraulichkeit und Beteiligung, Schreibrechte samt
 * Projektteam, unveränderliche Beiträge, automatische Einträge nur für Sichtbares,
 * „Als TOP vormerken“, Benachrichtigungen, Übernahme des alten Backlogs, Löschfrist, PDF.
 */

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Kategorie, KanbanStatus } from "@prisma/client";
import { anfrage, type Konto, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";
import { abgelaufeneThemenLoeschen, backlogUebernehmen, THEMEN_LOESCHFRIST_JAHRE } from "../src/lib/themenakte.js";

let env: TestUmgebung;

before(async () => { env = await starteTestumgebung(); });
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.thema.deleteMany();
  await prisma.nachricht.deleteMany();
});

const status = async (konto: Konto | null, methode: string, url: string, body?: unknown) =>
  (await anfrage(env, konto, methode, url, body)).statusCode;

async function neuesThema(von: Konto = "VORSITZ", extra: Record<string, unknown> = {}) {
  const res = await anfrage(env, von, "POST", "/api/themenakte", { titel: "BV mobiles Arbeiten", ...extra });
  assert.equal(res.statusCode, 201, res.body);
  return (res.json() as { id: string }).id;
}

const beitrag = (konto: Konto, id: string, inhalt = "Vermerk", inhaltJson?: object) =>
  anfrage(env, konto, "POST", `/api/themenakte/${id}/eintraege`, { art: "GESPRAECHSVERMERK", inhalt, inhaltJson });

describe("Themenakte: wer sieht was", () => {
  test("Stufe ALLE: Mitglieder und Ersatzmitglieder lesen; JAV/SBV/Externe nie", async () => {
    const id = await neuesThema();
    for (const k of ["STELLVERTRETER", "MITGLIED", "ERSATZMITGLIED"] as Konto[]) assert.equal(await status(k, "GET", `/api/themenakte/${id}`), 200, k);
    for (const k of ["JAV", "SBV", "EXTERN"] as Konto[]) assert.equal(await status(k, "GET", "/api/themenakte"), 403, k);
  });

  test("Stufe BETRIEBSRAT: Ersatzmitglied sieht nichts, nicht einmal in der Liste", async () => {
    const id = await neuesThema("VORSITZ", { vertraulichkeit: "BETRIEBSRAT" });
    assert.equal(await status("ERSATZMITGLIED", "GET", `/api/themenakte/${id}`), 404);
    const liste = (await anfrage(env, "ERSATZMITGLIED", "GET", "/api/themenakte")).json() as { id: string }[];
    assert.ok(!liste.some(t => t.id === id));
    assert.equal(await status("MITGLIED", "GET", `/api/themenakte/${id}`), 200);
  });

  test("Stufe VORSITZ: nur Leitung und Beteiligte – Beteiligung öffnet", async () => {
    const id = await neuesThema("VORSITZ", { vertraulichkeit: "VORSITZ" });
    assert.equal(await status("MITGLIED", "GET", `/api/themenakte/${id}`), 404);
    assert.equal(await status("STELLVERTRETER", "GET", `/api/themenakte/${id}`), 200);
    assert.equal(await status("STELLVERTRETER", "PATCH", `/api/themenakte/${id}`, {
      beteiligte: [{ benutzerId: env.ids.VORSITZ, zustaendig: true }, { benutzerId: env.ids.MITGLIED }],
    }), 200);
    assert.equal(await status("MITGLIED", "GET", `/api/themenakte/${id}`), 200);
  });

  test("Wer ein Thema anlegt, ist zuständig – sieht es also auch bei „nur Vorsitz“", async () => {
    const id = await neuesThema("MITGLIED", { vertraulichkeit: "VORSITZ" });
    const t = (await anfrage(env, "MITGLIED", "GET", `/api/themenakte/${id}`)).json();
    assert.equal(t.beteiligte[0].benutzer.id, env.ids.MITGLIED);
    assert.equal(t.beteiligte[0].zustaendig, true);
  });
});

describe("Themenakte: schreiben", () => {
  test("Ersatzmitglied nur in aktiver Vertretung", async () => {
    const id = await neuesThema();
    assert.equal((await beitrag("ERSATZMITGLIED", id)).statusCode, 403);
    assert.equal((await beitrag("ERSATZ_VERTRETUNG", id)).statusCode, 201);
    assert.equal((await beitrag("MITGLIED", id)).statusCode, 201);
  });

  test("Projektteam: nur Beteiligte und Vorsitz/Stellvertretung; festlegen nur Leitung", async () => {
    const id = await neuesThema();
    assert.equal(await status("MITGLIED", "PATCH", `/api/themenakte/${id}`, { nurTeam: true }), 403);
    assert.equal(await status("MITGLIED", "PATCH", `/api/themenakte/${id}`, { vertraulichkeit: "VORSITZ" }), 403);
    assert.equal(await status("VORSITZ", "PATCH", `/api/themenakte/${id}`, { nurTeam: true }), 200);

    assert.equal((await beitrag("MITGLIED", id)).statusCode, 403);
    assert.equal((await beitrag("STELLVERTRETER", id)).statusCode, 201);
    await anfrage(env, "VORSITZ", "PATCH", `/api/themenakte/${id}`, { beteiligte: [{ benutzerId: env.ids.MITGLIED, zustaendig: true }] });
    assert.equal((await beitrag("MITGLIED", id)).statusCode, 201);
  });

  test("Beiträge sind nicht veränderbar – nur Anheften", async () => {
    const id = await neuesThema();
    const eid = (await beitrag("MITGLIED", id, "Original")).json().id;
    // Ein mitgeschickter Inhalt wird vom Schema verworfen – angeheftet wird trotzdem, geändert nichts
    assert.equal(await status("MITGLIED", "PATCH", `/api/themenakte/${id}/eintraege/${eid}`, { angeheftet: true, inhalt: "geändert" }), 200);
    assert.equal(await status("VORSITZ", "DELETE", `/api/themenakte/${id}/eintraege/${eid}`), 404);
    const e = await prisma.themaEintrag.findUnique({ where: { id: eid } });
    assert.equal(e?.inhalt, "Original");
    assert.equal(e?.angeheftet, true);

    // Korrektur nur als neuer Beitrag mit Bezug – und nur innerhalb desselben Themas
    const fremd = await neuesThema();
    assert.equal((await anfrage(env, "MITGLIED", "POST", `/api/themenakte/${fremd}/eintraege`, { inhalt: "x", bezugId: eid })).statusCode, 400);
    assert.equal((await anfrage(env, "MITGLIED", "POST", `/api/themenakte/${id}/eintraege`, { inhalt: "Korrektur", bezugId: eid })).statusCode, 201);
  });

  test("Thema löschen nur Vorsitz/Stellvertretung", async () => {
    const id = await neuesThema("MITGLIED");
    assert.equal(await status("MITGLIED", "DELETE", `/api/themenakte/${id}`), 403);
    assert.equal(await status("STELLVERTRETER", "DELETE", `/api/themenakte/${id}`), 200);
  });
});

describe("Themenakte: Verlauf und Verknüpfungen", () => {
  test("automatische Einträge nur aus Sichtbarem – vertrauliches Dokument nicht für Mitglieder", async () => {
    const id = await neuesThema();
    const dok = await prisma.dokument.create({
      data: {
        titel: "Abmahnung Schmidt", vertraulich: true, kategorie: Kategorie.SONSTIGES,
        dateiname: "a.txt", speicherpfad: "x", verschlPfad: "x", dateigroesse: 1, mimeTyp: "text/plain", pruefsumme: "x",
        hochgeladenVonId: env.ids.VORSITZ,
      },
    });
    assert.equal(await status("MITGLIED", "POST", `/api/themenakte/${id}/verknuepfungen`, { typ: "DOKUMENT", zielId: dok.id }), 404, "nicht sichtbares Dokument nicht verknüpfbar");
    assert.equal(await status("VORSITZ", "POST", `/api/themenakte/${id}/verknuepfungen`, { typ: "DOKUMENT", zielId: dok.id }), 200);

    const vMitglied = (await anfrage(env, "MITGLIED", "GET", `/api/themenakte/${id}/verlauf`)).json();
    assert.ok(!JSON.stringify(vMitglied).includes("Schmidt"));
    const dMitglied = (await anfrage(env, "MITGLIED", "GET", `/api/themenakte/${id}`)).json();
    assert.equal(dMitglied.dokumente.length, 0);
    const vStv = (await anfrage(env, "STELLVERTRETER", "GET", `/api/themenakte/${id}/verlauf`)).json();
    assert.ok(vStv.automatisch.some((a: { text: string }) => a.text.includes("Schmidt")));
  });

  test("Als TOP vormerken: TOP gehört zum Thema, vertrauliches Thema → vertraulicher TOP", async () => {
    const id = await neuesThema("VORSITZ", { vertraulichkeit: "BETRIEBSRAT" });
    const s = (await anfrage(env, "VORSITZ", "POST", "/api/sitzungen", { titel: "Sitzung", sitzungsdatum: "2026-12-01T09:00" })).json();
    const res = await anfrage(env, "VORSITZ", "POST", `/api/sitzungen/${s.id}/tops`, { titel: "BV mobiles Arbeiten", themaId: id });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().themaId, id);
    assert.equal(res.json().vertraulich, true);

    const v = (await anfrage(env, "MITGLIED", "GET", `/api/themenakte/${id}/verlauf`)).json();
    assert.ok(v.automatisch.some((a: { art: string; text: string }) => a.art === "TOP" && a.text.includes("vorgemerkt")));

    // Ein nicht sichtbares Thema lässt sich nicht als TOP vormerken
    const geheim = await neuesThema("VORSITZ", { vertraulichkeit: "VORSITZ" });
    assert.equal(await status("MITGLIED", "POST", `/api/sitzungen/${s.id}/tops`, { titel: "x", themaId: geheim }), 404);
  });

  test("Beitrag benachrichtigt Beteiligte und Erwähnte – nur wer das Thema sieht", async () => {
    const id = await neuesThema("VORSITZ", { vertraulichkeit: "VORSITZ" });
    await anfrage(env, "VORSITZ", "PATCH", `/api/themenakte/${id}`, {
      beteiligte: [{ benutzerId: env.ids.VORSITZ, zustaendig: true }, { benutzerId: env.ids.STELLVERTRETER }],
    });
    const erwaehnung = {
      type: "doc", content: [{ type: "paragraph", content: [
        { type: "personErwaehnung", attrs: { benutzerId: env.ids.MITGLIED, name: "Mitglied" } },
      ] }],
    };
    assert.equal((await beitrag("VORSITZ", id, "@Mitglied bitte prüfen", erwaehnung)).statusCode, 201);
    const an = async (k: Konto) => (await prisma.nachricht.findMany({ where: { empfaengerId: env.ids[k] } })).map(n => n.art);
    assert.deepEqual(await an("STELLVERTRETER"), ["THEMA_BEITRAG"]);
    assert.deepEqual(await an("MITGLIED"), [], "sieht das Thema nicht – keine Benachrichtigung");
    assert.deepEqual(await an("VORSITZ"), []);
  });

  test("PDF-Chronik nur für Berechtigte", async () => {
    const id = await neuesThema("VORSITZ", { vertraulichkeit: "BETRIEBSRAT" });
    await beitrag("VORSITZ", id, "Erster Vermerk");
    const res = await anfrage(env, "MITGLIED", "GET", `/api/themenakte/${id}/chronik`);
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"]), /application\/pdf/);
    assert.equal(await status("ERSATZMITGLIED", "GET", `/api/themenakte/${id}/chronik`), 404);
  });
});

describe("Themenakte: Übernahme und Löschfrist", () => {
  test("Karten des alten Backlogs werden Themen – einmalig", async () => {
    const s = (await anfrage(env, "VORSITZ", "POST", "/api/sitzungen", { titel: "Sitzung", sitzungsdatum: "2026-12-01T09:00" })).json();
    const top = (await anfrage(env, "VORSITZ", "POST", `/api/sitzungen/${s.id}/tops`, { titel: "Schichtplan" })).json();
    await prisma.aufgabe.createMany({
      data: [
        { titel: "Schichtplan-Software", beschreibung: "Software kommt im März", kanbanStatus: KanbanStatus.IN_BEARBEITUNG,
          erstelltVonId: env.ids.VORSITZ, zugewiesenAnId: env.ids.MITGLIED, topId: top.id },
        { titel: "Private Idee", kanbanStatus: KanbanStatus.BACKLOG, sichtbarkeit: "PRIVAT", erstelltVonId: env.ids.MITGLIED },
        { titel: "Normale Aufgabe", erstelltVonId: env.ids.VORSITZ },
      ],
    });
    assert.equal(await backlogUebernehmen(), 2);
    assert.equal(await backlogUebernehmen(), 0);
    assert.equal(await prisma.aufgabe.count({ where: { kanbanStatus: { not: null } } }), 0);
    assert.equal(await prisma.aufgabe.count({ where: { titel: "Normale Aufgabe" } }), 1);

    const schicht = await prisma.thema.findFirstOrThrow({ where: { titel: "Schichtplan-Software" }, include: { beteiligte: true, eintraege: true, tops: true } });
    assert.equal(schicht.status, "IN_VERHANDLUNG");
    assert.deepEqual(schicht.beteiligte.map(b => [b.benutzerId, b.zustaendig]), [[env.ids.MITGLIED, true]]);
    assert.equal(schicht.eintraege[0]?.inhalt, "Software kommt im März");
    assert.equal(schicht.tops[0]?.id, top.id);

    const privat = await prisma.thema.findFirstOrThrow({ where: { titel: "Private Idee" }, include: { beteiligte: true } });
    assert.equal(privat.vertraulichkeit, "VORSITZ");
    assert.deepEqual(privat.beteiligte.map(b => b.benutzerId), [env.ids.MITGLIED]);
  });

  test("Löschfrist: abgeschlossene Themen nach X Jahren weg, 0 = nie", async () => {
    const alt = await neuesThema();
    const neu = await neuesThema();
    const offen = await neuesThema();
    const vor = (jahre: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - jahre); return d; };
    await prisma.thema.update({ where: { id: alt }, data: { status: "ABGESCHLOSSEN", abgeschlossenAm: vor(4) } });
    await prisma.thema.update({ where: { id: neu }, data: { status: "ABGESCHLOSSEN", abgeschlossenAm: vor(1) } });
    await prisma.thema.update({ where: { id: offen }, data: { abgeschlossenAm: vor(10) } });

    await prisma.systemEinstellung.upsert({ where: { schluessel: THEMEN_LOESCHFRIST_JAHRE }, update: { wert: "0" }, create: { schluessel: THEMEN_LOESCHFRIST_JAHRE, wert: "0" } });
    assert.equal(await abgelaufeneThemenLoeschen(), 0);
    await prisma.systemEinstellung.delete({ where: { schluessel: THEMEN_LOESCHFRIST_JAHRE } });
    assert.equal(await abgelaufeneThemenLoeschen(), 1);   // Standard: 3 Jahre
    assert.deepEqual((await prisma.thema.findMany({ select: { id: true } })).map(t => t.id).sort(), [neu, offen].sort());
  });

  test("Status „abgeschlossen“ setzt den Beginn der Löschfrist, Wiedereröffnen löscht ihn", async () => {
    const id = await neuesThema();
    await anfrage(env, "MITGLIED", "PATCH", `/api/themenakte/${id}`, { status: "ABGESCHLOSSEN" });
    assert.ok((await prisma.thema.findUnique({ where: { id } }))?.abgeschlossenAm);
    await anfrage(env, "MITGLIED", "PATCH", `/api/themenakte/${id}`, { status: "OFFEN" });
    assert.equal((await prisma.thema.findUnique({ where: { id } }))?.abgeschlossenAm, null);
  });
});
