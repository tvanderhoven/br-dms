/**
 * Kummerkasten-Rückkanal (lib/kummerkastenTicket.ts, routes/kummerkasten.ts):
 * Einreichen liefert einmalig einen Ticket-Code, mit dem Status und BR-Antwort
 * ohne Login abrufbar sind. Gespeichert wird nur der HMAC des Codes; der Abruf
 * gibt nie die Originalnachricht oder die interne Notiz heraus.
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { CODE_ALPHABET, CODE_LAENGE, codeNormalisieren, ticketHash } from "../src/lib/kummerkastenTicket.js";
import { anfrage, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";

let env: TestUmgebung;

before(async () => {
  env = await starteTestumgebung();
});
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});

describe("Kummerkasten-Rückkanal", () => {
  let ticketCode = "";
  let eintragId = "";

  test("Einreichen ohne Login liefert einen 6-stelligen Code aus dem Alphabet", async () => {
    const res = await anfrage(env, null, "POST", "/api/kummerkasten", { nachricht: "In Halle 2 zieht es." });
    assert.equal(res.statusCode, 201, res.body);
    ticketCode = res.json().ticketCode;
    assert.equal(ticketCode.length, CODE_LAENGE);
    for (const zeichen of ticketCode) assert.ok(CODE_ALPHABET.includes(zeichen), `unerwartetes Zeichen ${zeichen}`);
  });

  test("in der Datenbank steht nur der HMAC, nie der Code selbst", async () => {
    const eintrag = await prisma.kummerkastenEintrag.findUnique({ where: { ticketCodeHash: ticketHash(ticketCode) } });
    assert.ok(eintrag, "Eintrag über den Hash auffindbar");
    eintragId = eintrag.id;
    assert.notEqual(eintrag.ticketCodeHash, ticketCode);
    assert.equal(eintrag.ticketCodeHash?.length, 64); // SHA-256-Hex
  });

  test("Abruf ist tolerant gegen Kleinschreibung und Trenner, liefert aber nie Nachricht oder Notiz", async () => {
    const abgetippt = `${ticketCode.slice(0, 3).toLowerCase()}-${ticketCode.slice(3)} `;
    assert.equal(codeNormalisieren(abgetippt), ticketCode);
    const res = await anfrage(env, null, "POST", "/api/kummerkasten/ticket", { code: abgetippt });
    assert.equal(res.statusCode, 200, res.body);
    const ticket = res.json();
    assert.equal(ticket.status, "NEU");
    assert.equal(ticket.antwort, null);
    assert.deepEqual(Object.keys(ticket).sort(), ["antwort", "antwortAm", "erstelltAm", "status"]);
  });

  test("falscher Code: einheitliches 404, egal ob unbekannt oder falsches Format", async () => {
    for (const code of ["222222", "zu-kurz", "VIELZULANGERCODE"]) {
      const res = await anfrage(env, null, "POST", "/api/kummerkasten/ticket", { code });
      assert.equal(res.statusCode, 404, `${code}: ${res.body}`);
    }
  });

  test("BR beantwortet den Eintrag – der Abruf zeigt Status und Antwort", async () => {
    const res = await anfrage(env, "VORSITZ", "PATCH", `/api/kummerkasten/${eintragId}`, {
      status: "IN_BEARBEITUNG", antwort: "Wir sprechen das beim Arbeitsschutz an.", notiz: "intern: Begehung anfragen",
    });
    assert.equal(res.statusCode, 200, res.body);

    const abruf = await anfrage(env, null, "POST", "/api/kummerkasten/ticket", { code: ticketCode });
    const ticket = abruf.json();
    assert.equal(ticket.status, "IN_BEARBEITUNG");
    assert.equal(ticket.antwort, "Wir sprechen das beim Arbeitsschutz an.");
    assert.ok(ticket.antwortAm, "antwortAm gesetzt");
  });

  test("Antwort gelöscht → antwortAm wieder leer", async () => {
    await anfrage(env, "VORSITZ", "PATCH", `/api/kummerkasten/${eintragId}`, { antwort: null });
    const ticket = (await anfrage(env, null, "POST", "/api/kummerkasten/ticket", { code: ticketCode })).json();
    assert.equal(ticket.antwort, null);
    assert.equal(ticket.antwortAm, null);
  });

  test("BR-Liste nennt den Rückkanal, gibt den Hash aber nicht heraus", async () => {
    const res = await anfrage(env, "VORSITZ", "GET", "/api/kummerkasten");
    assert.equal(res.statusCode, 200, res.body);
    const eintrag = res.json().find((e: { id: string }) => e.id === eintragId);
    assert.ok(eintrag, "Eintrag in der Liste");
    assert.equal(eintrag.hatRueckkanal, true);
    assert.equal("ticketCodeHash" in eintrag, false);
  });

  test("Alteinträge ohne Code: hatRueckkanal false", async () => {
    const alt = await prisma.kummerkastenEintrag.create({ data: { nachricht: "Eintrag von früher" } });
    const res = await anfrage(env, "VORSITZ", "GET", "/api/kummerkasten");
    const eintrag = res.json().find((e: { id: string }) => e.id === alt.id);
    assert.equal(eintrag.hatRueckkanal, false);
  });

  test("Honeypot gefüllt: stiller Schein-Erfolg ohne Ticket-Code", async () => {
    const res = await anfrage(env, null, "POST", "/api/kummerkasten", { nachricht: "Spam", webseite: "http://bot.example" });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().ticketCode, undefined);
  });
});
