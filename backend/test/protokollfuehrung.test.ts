/**
 * Protokollführung (Roadmap Paket 3): Haken am Benutzer, Vorbelegung neuer Sitzungen,
 * Änderung je Sitzung durch Vorsitz/Stellvertretung.
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { SitzungStatus } from "@prisma/client";
import { anfrage, type Konto, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";

let env: TestUmgebung;

before(async () => { env = await starteTestumgebung(); });
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});

const status = async (konto: Konto | null, methode: string, url: string, body?: unknown) =>
  (await anfrage(env, konto, methode, url, body)).statusCode;

const neueSitzung = async () => {
  const res = await anfrage(env, "VORSITZ", "POST", "/api/sitzungen", { titel: "Sitzung", sitzungsdatum: "2026-12-01T09:00" });
  assert.equal(res.statusCode, 201, res.body);
  return res.json() as { id: string; protokollfuehrer: { id: string; name: string } | null };
};

describe("Protokollführung", () => {
  test("Haken setzt nur, wer Benutzer verwaltet (Vorsitz/Stellvertretung)", async () => {
    assert.equal(await status("MITGLIED", "PATCH", `/api/benutzer/${env.ids.MITGLIED}`, { protokollfuehrung: true }), 403);
    const res = await anfrage(env, "STELLVERTRETER", "PATCH", `/api/benutzer/${env.ids.MITGLIED}`, { protokollfuehrung: true });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().protokollfuehrung, true);
    const liste = (await anfrage(env, "MITGLIED", "GET", "/api/benutzer")).json();
    assert.equal(liste.find((b: { id: string }) => b.id === env.ids.MITGLIED).protokollfuehrung, true);
  });

  test("neue Sitzung ist mit der Person mit Haken vorbelegt", async () => {
    // Das Testkonto der externen Protokollführung hat den Haken immer – hier nur das Mitglied
    await prisma.benutzer.update({ where: { id: env.ids.EXTERN }, data: { protokollfuehrung: false } });
    const s = await neueSitzung();
    assert.equal(s.protokollfuehrer?.id, env.ids.MITGLIED);
  });

  test("ohne Haken bei niemandem bleibt die Protokollführung leer", async () => {
    await prisma.benutzer.updateMany({ data: { protokollfuehrung: false } });
    assert.equal((await neueSitzung()).protokollfuehrer, null);
  });

  test("Vorsitz ändert die Protokollführung; Gremiumsmitglied geht ohne Haken, JAV/Admin ohne Haken nicht", async () => {
    const s = await neueSitzung();
    const url = `/api/sitzungen/${s.id}`;
    assert.equal(await status("MITGLIED", "PATCH", url, { protokollfuehrerId: env.ids.MITGLIED }), 403);

    const res = await anfrage(env, "VORSITZ", "PATCH", url, { protokollfuehrerId: env.ids.ERSATZMITGLIED });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().protokollfuehrer.id, env.ids.ERSATZMITGLIED);

    assert.equal(await status("VORSITZ", "PATCH", url, { protokollfuehrerId: env.ids.JAV }), 400);
    assert.equal(await status("VORSITZ", "PATCH", url, { protokollfuehrerId: env.ids.ADMIN }), 400);

    // Mit Haken darf auch jemand außerhalb des Gremiums eingetragen werden (Grundlage für „Extern“)
    await prisma.benutzer.update({ where: { id: env.ids.SBV }, data: { protokollfuehrung: true } });
    assert.equal(await status("VORSITZ", "PATCH", url, { protokollfuehrerId: env.ids.SBV }), 200);

    assert.equal((await anfrage(env, "VORSITZ", "PATCH", url, { protokollfuehrerId: null })).json().protokollfuehrer, null);
  });

  test("nach der Finalisierung nicht mehr änderbar", async () => {
    const s = await neueSitzung();
    await prisma.sitzung.update({ where: { id: s.id }, data: { status: SitzungStatus.PROTOKOLL_FINAL } });
    assert.equal(await status("VORSITZ", "PATCH", `/api/sitzungen/${s.id}`, { protokollfuehrerId: env.ids.MITGLIED }), 409);
  });
});
