/**
 * Zugang bestätigen (lib/zugang.ts): vorläufige Fristen beim Import, Vorschau,
 * Neuberechnung ab bestätigtem Zugang, unpassende § 102-Frist fällt weg.
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { AuditAktion, FristStatus, Kategorie } from "@prisma/client";
import { verarbeiteDokument } from "../src/services/dokument-pipeline.service.js";
import { zugangVorschlag } from "../src/lib/zugang.js";
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
