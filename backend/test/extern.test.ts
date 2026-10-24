/**
 * Externe Protokollführung (Roadmap Paket 4) mit echten Daten: nur die eigene Sitzung bis zur
 * Finalisierung, keine vertraulichen TOPs und keine mit „Externe verlässt den Raum“, nur das
 * Protokoll schreiben, Zugriffsprotokoll, Verschwiegenheitserklärung als Pflicht.
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

/** multipart/form-data für app.inject, ohne Zusatzpaket */
function formular(felder: Record<string, string>, datei?: { name: string; typ: string; inhalt: Buffer }) {
  const grenze = "----brdmstest" + Math.random().toString(16).slice(2);
  const teile: Buffer[] = [];
  for (const [k, v] of Object.entries(felder)) {
    teile.push(Buffer.from(`--${grenze}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (datei) {
    teile.push(Buffer.from(`--${grenze}\r\nContent-Disposition: form-data; name="datei"; filename="${datei.name}"\r\nContent-Type: ${datei.typ}\r\n\r\n`));
    teile.push(datei.inhalt, Buffer.from("\r\n"));
  }
  teile.push(Buffer.from(`--${grenze}--\r\n`));
  return { payload: Buffer.concat(teile), headers: { "content-type": `multipart/form-data; boundary=${grenze}` } };
}

describe("Externe Protokollführung in ihrer Sitzung", () => {
  let sitzungId: string, fremdeSitzung: string, offenTop: string, geheimTop: string, rausTop: string;

  before(async () => {
    const neu = (titel: string, protokollfuehrerId: string | null) => prisma.sitzung.create({
      data: { titel, sitzungsdatum: new Date(), status: SitzungStatus.PROTOKOLL_ENTWURF, erstelltVonId: env.ids.VORSITZ,
        protokollfuehrerId, notizen: "INTERNE-NOTIZ" },
    });
    sitzungId     = (await neu("EIGENE-SITZUNG", env.ids.EXTERN)).id;
    fremdeSitzung = (await neu("FREMDE-SITZUNG", env.ids.MITGLIED)).id;
    offenTop  = (await prisma.tOP.create({ data: { sitzungId, nummer: 1, titel: "OFFEN-TOP Kantine" } })).id;
    geheimTop = (await prisma.tOP.create({ data: { sitzungId, nummer: 2, titel: "GEHEIM-TOP Kündigung", vertraulich: true } })).id;
    rausTop   = (await prisma.tOP.create({ data: { sitzungId, nummer: 3, titel: "RAUS-TOP Personalie", externAusgeschlossen: true } })).id;
    await prisma.protocolBlock.create({ data: { sitzungId, typ: "TEXT", topId: rausTop, inhalt: "RAUS-PROTOKOLL" } });
  });

  test("Liste und Detail: nur die eigene Sitzung, ohne verborgene TOPs und interne Notizen", async () => {
    const liste = (await anfrage(env, "EXTERN", "GET", "/api/sitzungen")).json();
    assert.deepEqual(liste.map((s: { id: string }) => s.id), [sitzungId]);

    const res = await anfrage(env, "EXTERN", "GET", `/api/sitzungen/${sitzungId}`);
    assert.equal(res.statusCode, 200, res.body);
    assert.match(res.body, /OFFEN-TOP/);
    assert.doesNotMatch(res.body, /GEHEIM-TOP|RAUS-TOP|INTERNE-NOTIZ/);

    assert.equal(await status("EXTERN", "GET", `/api/sitzungen/${fremdeSitzung}`), 403);
  });

  test("Protokoll: Ergebnis schreiben ja, Titel/Sichtbarkeit nein, verborgene TOPs wie nicht vorhanden", async () => {
    assert.equal(await status("EXTERN", "PATCH", `/api/sitzungen/${sitzungId}/tops/${offenTop}`, { ergebnis: "Beschlossen" }), 200);
    assert.equal(await status("EXTERN", "PATCH", `/api/sitzungen/${sitzungId}/tops/${offenTop}`, { externAusgeschlossen: false }), 403);
    assert.equal(await status("EXTERN", "PATCH", `/api/sitzungen/${sitzungId}/tops/${rausTop}`, { ergebnis: "x" }), 404);
    assert.equal(await status("EXTERN", "PATCH", `/api/sitzungen/${sitzungId}/tops/${geheimTop}`, { ergebnis: "x" }), 404);

    const bloecke = await anfrage(env, "EXTERN", "GET", `/api/sitzungen/${sitzungId}/blocks`);
    assert.equal(bloecke.statusCode, 200, bloecke.body);
    assert.doesNotMatch(bloecke.body, /RAUS-PROTOKOLL/);
    assert.equal(await status("EXTERN", "POST", `/api/sitzungen/${sitzungId}/blocks`, { typ: "TEXT", topId: rausTop, inhalt: "x" }), 404);
    assert.equal(await status("EXTERN", "POST", `/api/sitzungen/${sitzungId}/blocks`, { typ: "TEXT", topId: offenTop, inhalt: "Notiz" }), 201);
    const rausBlock = await prisma.protocolBlock.findFirstOrThrow({ where: { topId: rausTop } });
    assert.equal(await status("EXTERN", "PATCH", `/api/sitzungen/${sitzungId}/blocks/${rausBlock.id}`, { inhalt: "x" }), 404);

    assert.equal(await status("EXTERN", "GET", `/api/sitzungen/${sitzungId}/tops/${offenTop}/beschluesse`), 200);
    assert.equal(await status("EXTERN", "GET", `/api/sitzungen/${sitzungId}/tops/${rausTop}/beschluesse`), 404);
  });

  test("Anwesenheit führen ja – aber selbst nie in der Liste und nicht eintragbar", async () => {
    const liste = await anfrage(env, "EXTERN", "GET", `/api/sitzungen/${sitzungId}/anwesenheit`);
    assert.equal(liste.statusCode, 200, liste.body);
    assert.ok(!liste.body.includes(env.ids.EXTERN), "Externe steht in der Anwesenheitsliste");
    assert.equal(await status("EXTERN", "POST", `/api/sitzungen/${sitzungId}/anwesenheit`, { benutzerId: env.ids.MITGLIED, status: "ANWESEND" }), 201);
    assert.equal(await status("VORSITZ", "POST", `/api/sitzungen/${sitzungId}/anwesenheit`, { benutzerId: env.ids.EXTERN, status: "ANWESEND" }), 404);
  });

  test("Vorsitz-Aktionen, Dateien und alles außerhalb der Positivliste bleiben gesperrt", async () => {
    assert.equal(await status("EXTERN", "POST", `/api/sitzungen/${sitzungId}/finalisieren`), 403);
    assert.equal(await status("EXTERN", "PATCH", `/api/sitzungen/${sitzungId}`, { titel: "x" }), 403);
    assert.equal(await status("EXTERN", "GET", `/api/sitzungen/${sitzungId}/sitzungspaket`), 403);
    assert.equal(await status("EXTERN", "GET", `/api/sitzungen/${sitzungId}/einladung`), 403);
    assert.equal(await status("EXTERN", "GET", "/api/dokumente"), 403);
    assert.equal(await status("EXTERN", "GET", "/api/kummerkasten"), 403);
  });

  test("jedes Öffnen und Ändern landet im Zugriffsprotokoll", async () => {
    const eintraege = await prisma.auditLog.findMany({ where: { benutzerId: env.ids.EXTERN, aktion: "EXTERN_ZUGRIFF", sitzungId } });
    assert.ok(eintraege.some(e => (e.details as { methode: string }).methode === "GET"));
    assert.ok(eintraege.some(e => (e.details as { methode: string }).methode === "PATCH"));
  });

  test("mit der Finalisierung endet der Zugriff", async () => {
    await prisma.sitzung.update({ where: { id: sitzungId }, data: { status: SitzungStatus.PROTOKOLL_FINAL } });
    assert.equal(await status("EXTERN", "GET", `/api/sitzungen/${sitzungId}`), 403);
    assert.deepEqual((await anfrage(env, "EXTERN", "GET", "/api/sitzungen")).json(), []);
  });

  test("Mitglieder sehen den TOP mit „Externe verlässt den Raum“ normal", async () => {
    assert.match((await anfrage(env, "MITGLIED", "GET", `/api/sitzungen/${sitzungId}`)).body, /RAUS-TOP/);
  });
});

describe("Konto für externe Protokollführung", () => {
  let id: string;

  test("neu angelegt: Haken gesetzt, aber gesperrt bis zur Erklärung", async () => {
    const res = await anfrage(env, "VORSITZ", "POST", "/api/benutzer", { name: "Bürokraft", email: "buero@test.lokal", rolle: "EXTERN", passwort: "geheim1234" });
    assert.equal(res.statusCode, 201, res.body);
    ({ id } = res.json());
    const b = await prisma.benutzer.findUniqueOrThrow({ where: { id } });
    assert.equal(b.aktiv, false);
    assert.equal(b.protokollfuehrung, true);
    assert.equal(await status("VORSITZ", "PATCH", `/api/benutzer/${id}`, { aktiv: true }), 409);
    assert.equal(await status("VORSITZ", "PATCH", `/api/benutzer/${id}`, { protokollfuehrung: false }), 400);
  });

  test("Erklärung: Bestätigung und Scan sind Pflicht, danach aktiv und nur für die Leitung abrufbar", async () => {
    const pdf = { name: "Erklaerung.pdf", typ: "application/pdf", inhalt: Buffer.from("%PDF-1.4 Testerklärung") };
    const ohneHaken = formular({}, pdf);
    assert.equal((await env.app.inject({ method: "POST", url: `/api/benutzer/${id}/verschwiegenheit`, ...ohneHaken,
      headers: { ...ohneHaken.headers, authorization: `Bearer ${env.token.VORSITZ}` } })).statusCode, 400);

    const mitHaken = formular({ bestaetigt: "true" }, pdf);
    const res = await env.app.inject({ method: "POST", url: `/api/benutzer/${id}/verschwiegenheit`, ...mitHaken,
      headers: { ...mitHaken.headers, authorization: `Bearer ${env.token.VORSITZ}` } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().aktiv, true);

    const download = await anfrage(env, "STELLVERTRETER", "GET", `/api/benutzer/${id}/verschwiegenheit`);
    assert.equal(download.statusCode, 200);
    assert.equal(download.rawPayload.toString(), "%PDF-1.4 Testerklärung");
    assert.equal(await status("MITGLIED", "GET", `/api/benutzer/${id}/verschwiegenheit`), 403);
  });
});
