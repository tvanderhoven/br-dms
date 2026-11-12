/**
 * Kummerkasten-Rückkanal (lib/kummerkastenTicket.ts, routes/kummerkasten.ts):
 * Einreichen liefert einmalig einen Ticket-Code, mit dem der Einreicher ohne Login den
 * Gesprächsverlauf abruft und Rückfragen stellt; der BR antwortet aus der Verwaltung.
 * Gespeichert wird nur der HMAC des Codes. Der Einreicher sieht nie die interne Notiz
 * und nie den Namen eines BR-Mitglieds.
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { KummerkastenAbsender } from "@prisma/client";
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

const ticket = (code: string) => anfrage(env, null, "POST", "/api/kummerkasten/ticket", { code });
const rueckfrage = (code: string, text: string) => anfrage(env, null, "POST", "/api/kummerkasten/ticket/nachricht", { code, text });

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

  test("Abruf: tolerant gegen Kleinschreibung und Trenner, erste Blase ist die eigene Nachricht", async () => {
    const abgetippt = `${ticketCode.slice(0, 3).toLowerCase()}-${ticketCode.slice(3)} `;
    assert.equal(codeNormalisieren(abgetippt), ticketCode);
    const res = await ticket(abgetippt);
    assert.equal(res.statusCode, 200, res.body);
    const t = res.json();
    assert.equal(t.status, "NEU");
    assert.deepEqual(Object.keys(t).sort(), ["erstelltAm", "nachrichten", "status"]);
    assert.equal(t.nachrichten.length, 1);
    assert.equal(t.nachrichten[0].absender, "EINREICHER");
    assert.equal(t.nachrichten[0].text, "In Halle 2 zieht es.");
  });

  test("falscher Code: einheitliches 404, egal ob unbekannt oder falsches Format", async () => {
    for (const code of ["222222", "zu-kurz", "VIELZULANGERCODE"]) {
      assert.equal((await ticket(code)).statusCode, 404, code);
      assert.equal((await rueckfrage(code, "Hallo")).statusCode, 404, code);
    }
  });

  test("BR antwortet: Einreicher sieht „Betriebsrat“, weder Namen noch interne Notiz", async () => {
    await anfrage(env, "VORSITZ", "PATCH", `/api/kummerkasten/${eintragId}`, { status: "IN_BEARBEITUNG", notiz: "intern: Begehung anfragen" });
    const res = await anfrage(env, "MITGLIED", "POST", `/api/kummerkasten/${eintragId}/nachrichten`, { text: "Wir sprechen das beim Arbeitsschutz an." });
    assert.equal(res.statusCode, 201, res.body);

    const abruf = (await ticket(ticketCode)).json();
    assert.equal(abruf.status, "IN_BEARBEITUNG");
    assert.deepEqual(abruf.nachrichten.map((n: { absender: string }) => n.absender), ["EINREICHER", "BETRIEBSRAT"]);
    assert.equal(abruf.nachrichten[1].text, "Wir sprechen das beim Arbeitsschutz an.");
    assert.deepEqual(Object.keys(abruf.nachrichten[1]).sort(), ["absender", "erstelltAm", "text"]);
    assert.ok(!JSON.stringify(abruf).includes("intern: Begehung"), "interne Notiz bleibt intern");
  });

  test("Rückfrage des Einreichers: im Verlauf, BR sieht „offene Rückfrage“ und wird benachrichtigt", async () => {
    const vorher = await prisma.nachricht.count({ where: { empfaengerId: env.ids.VORSITZ, betreff: "Neue Rückfrage im Kummerkasten" } });
    const res = await rueckfrage(ticketCode, "Gibt es schon einen Termin?");
    assert.equal(res.statusCode, 201, res.body);
    assert.deepEqual(res.json().nachrichten.map((n: { absender: string }) => n.absender), ["EINREICHER", "BETRIEBSRAT", "EINREICHER"]);

    const liste = (await anfrage(env, "VORSITZ", "GET", "/api/kummerkasten")).json();
    const eintrag = liste.find((e: { id: string }) => e.id === eintragId);
    assert.equal(eintrag.offeneRueckfrage, true);
    assert.equal(eintrag.nachrichten.length, 2); // ohne die ursprüngliche Nachricht
    assert.equal(eintrag.nachrichten[0].bearbeitetVon.name.length > 0, true, "BR sieht, wer geantwortet hat");

    const nachher = await prisma.nachricht.count({ where: { empfaengerId: env.ids.VORSITZ, betreff: "Neue Rückfrage im Kummerkasten" } });
    assert.equal(nachher, vorher + 1);

    // Antwort des BR schließt die Rückfrage wieder
    await anfrage(env, "VORSITZ", "POST", `/api/kummerkasten/${eintragId}/nachrichten`, { text: "Nächste Woche Mittwoch." });
    const danach = (await anfrage(env, "VORSITZ", "GET", "/api/kummerkasten")).json().find((e: { id: string }) => e.id === eintragId);
    assert.equal(danach.offeneRueckfrage, false);
  });

  test("Rückfrage zu einem erledigten Anliegen öffnet es wieder", async () => {
    await anfrage(env, "VORSITZ", "PATCH", `/api/kummerkasten/${eintragId}`, { status: "ERLEDIGT" });
    assert.equal((await ticket(ticketCode)).json().status, "ERLEDIGT");
    const res = await rueckfrage(ticketCode, "Doch noch eine Frage.");
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().status, "IN_BEARBEITUNG");
  });

  test("Eingabe wird geprüft: leer, nur Leerzeichen und zu lang sind abgelehnt", async () => {
    for (const text of ["", "   ", "x".repeat(2001)]) {
      const res = await rueckfrage(ticketCode, text);
      assert.equal(res.statusCode, 400, `Länge ${text.length}: ${res.body}`);
    }
    const bru = await anfrage(env, "VORSITZ", "POST", `/api/kummerkasten/${eintragId}/nachrichten`, { text: "   " });
    assert.equal(bru.statusCode, 400);
  });

  test("Obergrenze je Ticket: danach 409, auch für den BR", async () => {
    const voll = await anfrage(env, null, "POST", "/api/kummerkasten", { nachricht: "Vielschreiber" });
    const code = voll.json().ticketCode;
    const e = await prisma.kummerkastenEintrag.findUniqueOrThrow({ where: { ticketCodeHash: ticketHash(code) } });
    await prisma.kummerkastenNachricht.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({ eintragId: e.id, absender: KummerkastenAbsender.EINREICHER, text: `Nachricht ${i}` })),
    });
    assert.equal((await rueckfrage(code, "Nummer 51")).statusCode, 409);
    assert.equal((await anfrage(env, "VORSITZ", "POST", `/api/kummerkasten/${e.id}/nachrichten`, { text: "Auch ich nicht" })).statusCode, 409);
  });

  test("BR-Liste nennt den Rückkanal, gibt den Hash aber nicht heraus", async () => {
    const res = await anfrage(env, "VORSITZ", "GET", "/api/kummerkasten");
    assert.equal(res.statusCode, 200, res.body);
    const eintrag = res.json().find((e: { id: string }) => e.id === eintragId);
    assert.equal(eintrag.hatRueckkanal, true);
    assert.equal("ticketCodeHash" in eintrag, false);
  });

  test("Alteintrag ohne Code: kein Rückkanal, BR kann nicht antworten", async () => {
    const alt = await prisma.kummerkastenEintrag.create({ data: { nachricht: "Eintrag von früher" } });
    const eintrag = (await anfrage(env, "VORSITZ", "GET", "/api/kummerkasten")).json().find((e: { id: string }) => e.id === alt.id);
    assert.equal(eintrag.hatRueckkanal, false);
    assert.equal((await anfrage(env, "VORSITZ", "POST", `/api/kummerkasten/${alt.id}/nachrichten`, { text: "Hallo?" })).statusCode, 400);
  });

  test("Eintrag löschen entfernt den Verlauf mit; der Code führt ins Leere", async () => {
    assert.ok(await prisma.kummerkastenNachricht.count({ where: { eintragId } }) > 0);
    assert.equal((await anfrage(env, "VORSITZ", "DELETE", `/api/kummerkasten/${eintragId}`)).statusCode, 200);
    assert.equal(await prisma.kummerkastenNachricht.count({ where: { eintragId } }), 0);
    assert.equal((await ticket(ticketCode)).statusCode, 404);
  });

  test("Honeypot gefüllt: stiller Schein-Erfolg ohne Ticket-Code", async () => {
    const res = await anfrage(env, null, "POST", "/api/kummerkasten", { nachricht: "Spam", webseite: "http://bot.example" });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().ticketCode, undefined);
  });
});
