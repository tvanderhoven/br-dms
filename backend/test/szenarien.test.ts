/**
 * Rollentests mit echten Daten – für Regeln, die nicht an der Mindestrolle
 * hängen, sondern im Handler geprüft werden (Vertraulichkeit, Autorenschaft,
 * Teilrechte wie „Mitglieder dürfen nur den Gehaltstabellen-Schalter setzen“).
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Kategorie, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { aktuellerSchritt, codeFuer } from "../src/lib/zweiFaktor.js";
import { anfrage, type Konto, pfadFuellen, prisma, starteTestumgebung, type TestUmgebung } from "./hilfe.js";

let env: TestUmgebung;

before(async () => { env = await starteTestumgebung(); });
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});

const status = async (konto: Konto | null, methode: string, url: string, body?: unknown) =>
  (await anfrage(env, konto, methode, url, body)).statusCode;

function dokumentAnlegen(titel: string, vonKonto: Konto, vertraulich: boolean, vertraulichFuerMitglieder = false) {
  return prisma.dokument.create({
    data: {
      titel, vertraulich, vertraulichFuerMitglieder, kategorie: Kategorie.SONSTIGES,
      dateiname: "test.txt", speicherpfad: "nicht/vorhanden", verschlPfad: "nicht/vorhanden",
      dateigroesse: 1, mimeTyp: "text/plain", pruefsumme: "x",
      hochgeladenVonId: env.ids[vonKonto],
    },
  });
}

describe("Vertrauliche Dokumente", () => {
  let geheim: string, eigenes: string, offen: string;

  before(async () => {
    geheim  = (await dokumentAnlegen("GEHEIM-DOK", "VORSITZ", true)).id;
    eigenes = (await dokumentAnlegen("EIGENES-DOK", "MITGLIED", true)).id;
    offen   = (await dokumentAnlegen("OFFENES-DOK", "VORSITZ", false)).id;
  });

  test("Liste: Mitglied sieht offene und eigene vertrauliche, nicht fremde vertrauliche", async () => {
    const res = await anfrage(env, "MITGLIED", "GET", "/api/dokumente");
    assert.equal(res.statusCode, 200, res.body);
    assert.match(res.body, /OFFENES-DOK/);
    assert.match(res.body, /EIGENES-DOK/);
    assert.doesNotMatch(res.body, /GEHEIM-DOK/);
  });

  test("Liste und Suche: Vorsitz und Stellvertretung sehen alles Vertrauliche", async () => {
    for (const konto of ["VORSITZ", "STELLVERTRETER"] as const) {
      const res = await anfrage(env, konto, "GET", "/api/dokumente");
      assert.match(res.body, /GEHEIM-DOK/, konto);
      assert.match(res.body, /EIGENES-DOK/, konto);
    }
  });

  test("Suche verrät fremde vertrauliche Titel nicht", async () => {
    const res = await anfrage(env, "MITGLIED", "GET", "/api/dokumente/suche?q=GEHEIM");
    assert.doesNotMatch(res.body, /GEHEIM-DOK/);
    const global = await anfrage(env, "MITGLIED", "GET", "/api/suche?q=GEHEIM");
    assert.doesNotMatch(global.body, /GEHEIM-DOK/);
  });

  test("jede Route an einem fremden vertraulichen Dokument weist ein Mitglied ab", async () => {
    // Alle Routen der Form /api/dokumente/:id… bzw. /:dokumentId…, die ein Mitglied
    // überhaupt erreichen darf (Mindestrolle höchstens MITGLIED)
    const routen = env.routen.filter(r =>
      /^\/api\/dokumente\/:(id|dokumentId)(\/|$)/.test(r.pfad)
      && (r.mindestRolle === null || r.mindestRolle === "MITGLIED" || r.mindestRolle === "ERSATZMITGLIED"));
    assert.ok(routen.length >= 10, "zu wenige Dokument-Routen gefunden");

    const offenGelassen: string[] = [];
    for (const r of routen) {
      const url = pfadFuellen(r.pfad.replace(/:(id|dokumentId)/, geheim));
      const body = ["POST", "PUT", "PATCH"].includes(r.methode) ? { inhalt: "x", titel: "x" } : undefined;
      const res = await anfrage(env, "MITGLIED", r.methode, url, body);
      if (res.statusCode !== 403 && res.statusCode !== 404) offenGelassen.push(`${r.methode} ${r.pfad} → ${res.statusCode}`);
      if (res.body.includes("GEHEIM-DOK")) offenGelassen.push(`${r.methode} ${r.pfad} verrät den Titel`);
    }
    assert.deepEqual(offenGelassen, []);
  });

  test("Detail: eigenes vertrauliches und offenes Dokument sind lesbar", async () => {
    assert.equal(await status("MITGLIED", "GET", `/api/dokumente/${eigenes}`), 200);
    assert.equal(await status("MITGLIED", "GET", `/api/dokumente/${offen}`), 200);
    assert.equal(await status("STELLVERTRETER", "GET", `/api/dokumente/${geheim}`), 200);
  });
});

describe("Vertrauliche Dokumente: Stufe „Betriebsrat“", () => {
  let gremium: string;

  before(async () => {
    gremium = (await dokumentAnlegen("BR-DOK", "VORSITZ", true, true)).id;
  });

  test("Liste und Suche: Mitglieder, Vorsitz, Stellvertretung und Admin sehen es, Ersatzmitglieder nicht", async () => {
    for (const konto of ["MITGLIED", "VORSITZ", "STELLVERTRETER", "ADMIN"] as const) {
      const res = await anfrage(env, konto, "GET", "/api/dokumente");
      assert.match(res.body, /BR-DOK/, konto);
    }
    const ersatz = await anfrage(env, "ERSATZMITGLIED", "GET", "/api/dokumente");
    assert.doesNotMatch(ersatz.body, /BR-DOK/);
    assert.doesNotMatch((await anfrage(env, "ERSATZMITGLIED", "GET", "/api/dokumente/suche?q=BR-DOK")).body, /BR-DOK/);
    assert.doesNotMatch((await anfrage(env, "ERSATZMITGLIED", "GET", "/api/suche?q=BR-DOK")).body, /BR-DOK/);
  });

  test("Detail: Mitglied darf lesen, Ersatzmitglied nicht", async () => {
    assert.equal(await status("MITGLIED", "GET", `/api/dokumente/${gremium}`), 200);
    const code = await status("ERSATZMITGLIED", "GET", `/api/dokumente/${gremium}`);
    assert.ok(code === 403 || code === 404, String(code));
  });

  test("jede Route an dem Dokument weist ein Ersatzmitglied ab", async () => {
    const routen = env.routen.filter(r =>
      /^\/api\/dokumente\/:(id|dokumentId)(\/|$)/.test(r.pfad)
      && (r.mindestRolle === null || r.mindestRolle === "ERSATZMITGLIED"));
    const offenGelassen: string[] = [];
    for (const r of routen) {
      const url = pfadFuellen(r.pfad.replace(/:(id|dokumentId)/, gremium));
      const body = ["POST", "PUT", "PATCH"].includes(r.methode) ? { inhalt: "x", titel: "x" } : undefined;
      const res = await anfrage(env, "ERSATZMITGLIED", r.methode, url, body);
      if (res.statusCode !== 403 && res.statusCode !== 404) offenGelassen.push(`${r.methode} ${r.pfad} → ${res.statusCode}`);
      if (res.body.includes("BR-DOK")) offenGelassen.push(`${r.methode} ${r.pfad} verrät den Titel`);
    }
    assert.deepEqual(offenGelassen, []);
  });

  test("Zurück auf offen setzt „für Mitglieder“ mit zurück", async () => {
    const d = await dokumentAnlegen("BR-DOK-2", "VORSITZ", true, true);
    assert.equal(await status("VORSITZ", "PATCH", `/api/dokumente/${d.id}`, { vertraulich: false }), 200);
    const danach = await prisma.dokument.findUniqueOrThrow({ where: { id: d.id } });
    assert.equal(danach.vertraulichFuerMitglieder, false);
  });
});

describe("Fremdprotokolle", () => {
  before(async () => {
    const gremium = await prisma.gremium.create({ data: { name: "Wirtschaftsausschuss" } });
    await prisma.gremiumMitglied.create({ data: { gremiumId: gremium.id, benutzerId: env.ids.MITGLIED } });
    await prisma.fremdprotokoll.create({
      data: {
        gremiumId: gremium.id, datum: new Date(), titel: "WA-GEHEIM", vertraulich: true,
        dateiname: "wa.pdf", speicherpfad: "x", verschlPfad: "x", dateigroesse: 1, mimeTyp: "application/pdf",
        pruefsumme: "x", hochgeladenVonId: env.ids.VORSITZ,
      },
    });
  });

  test("vertrauliches Protokoll sehen nur Gremiumsmitglieder sowie Vorsitz/Stellvertretung", async () => {
    const sicht = async (k: Konto) => (await anfrage(env, k, "GET", "/api/fremdprotokolle")).body.includes("WA-GEHEIM");
    assert.equal(await sicht("MITGLIED"), true, "Gremiumsmitglied");
    assert.equal(await sicht("STELLVERTRETER"), true, "Stellvertretung");
    assert.equal(await sicht("ERSATZ_VERTRETUNG"), false, "Nicht-Mitglied des Gremiums");
  });

  test("Download für Nicht-Gremiumsmitglied gesperrt", async () => {
    const p = await prisma.fremdprotokoll.findFirstOrThrow({ where: { titel: "WA-GEHEIM" } });
    const s = await status("ERSATZ_VERTRETUNG", "GET", `/api/fremdprotokolle/${p.id}/download`);
    assert.ok(s === 403 || s === 404, `Status ${s}`);
  });
});

describe("Mitarbeiterdaten (Entscheidung 09.10.2026)", () => {
  let id: string;

  test("Mitglied darf lesen und anlegen", async () => {
    assert.equal(await status("MITGLIED", "GET", "/api/mitarbeiter"), 200);
    const res = await anfrage(env, "MITGLIED", "POST", "/api/mitarbeiter", { vorname: "Erika", nachname: "Muster" });
    assert.equal(res.statusCode, 201, res.body);
    id = res.json().id;
  });

  test("Mitglied darf nur den Gehaltstabellen-Schalter ändern", async () => {
    assert.equal(await status("MITGLIED", "PATCH", `/api/mitarbeiter/${id}`, { nachname: "Anders" }), 403);
    assert.equal(await status("MITGLIED", "PATCH", `/api/mitarbeiter/${id}`, { gehaltIgnorieren: true }), 200);
  });

  test("Vorsitz und Stellvertretung dürfen ändern, löschen nur sie", async () => {
    assert.equal(await status("STELLVERTRETER", "PATCH", `/api/mitarbeiter/${id}`, { nachname: "Anders" }), 200);
    assert.equal(await status("MITGLIED", "DELETE", `/api/mitarbeiter/${id}`), 403);
    assert.equal(await status("VORSITZ", "DELETE", `/api/mitarbeiter/${id}`), 200);
  });

  test("Ersatzmitglied: ohne Vertretung nur abgewiesen, mit Vertretung wie ein Mitglied", async () => {
    assert.equal(await status("ERSATZMITGLIED", "GET", "/api/mitarbeiter"), 403);
    assert.equal(await status("ERSATZ_VERTRETUNG", "GET", "/api/mitarbeiter"), 200);
    const res = await anfrage(env, "ERSATZ_VERTRETUNG", "POST", "/api/mitarbeiter", { vorname: "Max", nachname: "Vertretung" });
    assert.equal(res.statusCode, 201, res.body);
  });
});

describe("Kummerkasten (Entscheidung 09.10.2026: jeder mit Konto darf bearbeiten)", () => {
  test("anonym einreichen, Ersatzmitglied bearbeitet, JAV nicht", async () => {
    assert.equal(await status(null, "POST", "/api/kummerkasten", { nachricht: "Kaffeemaschine kaputt" }), 201);
    const eintrag = await prisma.kummerkastenEintrag.findFirstOrThrow();
    assert.equal(await status("ERSATZMITGLIED", "PATCH", `/api/kummerkasten/${eintrag.id}`, { notiz: "kümmere mich" }), 200);
    assert.equal(await status("JAV", "PATCH", `/api/kummerkasten/${eintrag.id}`, { notiz: "x" }), 403);
    assert.equal(await status(null, "GET", "/api/kummerkasten"), 401);
  });
});

describe("Inhaltszugriff des Admins umschalten", () => {
  test("nur Vorsitz und Stellvertretung, ausdrücklich nicht der Admin", async () => {
    for (const k of ["ADMIN", "MITGLIED", "ERSATZ_VERTRETUNG"] as const) {
      assert.equal(await status(k, "PUT", "/api/einstellungen/admin-zugriff", { inhaltszugriff: false }), 403, k);
    }
    assert.equal(await status("STELLVERTRETER", "PUT", "/api/einstellungen/admin-zugriff", { inhaltszugriff: false }), 200);
    assert.equal(await status("ADMIN", "GET", "/api/dokumente"), 403);
    assert.equal(await status("ADMIN", "PUT", "/api/einstellungen/admin-zugriff", { inhaltszugriff: true }), 403,
      "Admin darf sich den Zugriff nicht selbst zurückgeben");
    assert.equal(await status("VORSITZ", "PUT", "/api/einstellungen/admin-zugriff", { inhaltszugriff: true }), 200);
    assert.equal(await status("ADMIN", "GET", "/api/dokumente"), 200);
  });
});

describe("Benutzerverwaltung", () => {
  test("Vorsitz darf kein Admin-Konto anlegen", async () => {
    const res = await anfrage(env, "VORSITZ", "POST", "/api/benutzer",
      { email: "neu@test.lokal", name: "Neu", rolle: "ADMIN", passwort: "Sehr-sicheres-Passwort-123" });
    assert.equal(res.statusCode, 403, res.body);
  });

  test("Mitglied darf keine Rollen vergeben", async () => {
    assert.equal(await status("MITGLIED", "PATCH", `/api/benutzer/${env.ids.MITGLIED}`, { rolle: "VORSITZ" }), 403);
  });
});

describe("Kommentare löschen", () => {
  let sitzungId: string;
  before(async () => {
    sitzungId = (await prisma.sitzung.create({
      data: { titel: "Kommentar-Sitzung", sitzungsdatum: new Date(), erstelltVonId: env.ids.VORSITZ },
    })).id;
  });

  test("fremden Kommentar löschen nur Vorsitz/Stellvertretung, eigenen jeder", async () => {
    const neu = async (k: Konto) => (await anfrage(env, k, "POST", `/api/sitzungen/${sitzungId}/kommentare`, { inhalt: `von ${k}` })).json().id as string;
    const vonVorsitz = await neu("VORSITZ");
    assert.equal(await status("MITGLIED", "DELETE", `/api/sitzungen/${sitzungId}/kommentare/${vonVorsitz}`), 403);
    assert.equal(await status("STELLVERTRETER", "DELETE", `/api/sitzungen/${sitzungId}/kommentare/${vonVorsitz}`), 200);
    const vonMitglied = await neu("MITGLIED");
    assert.equal(await status("MITGLIED", "DELETE", `/api/sitzungen/${sitzungId}/kommentare/${vonMitglied}`), 200);
  });
});

describe("JAV und SBV: vertrauliche TOPs", () => {
  let sitzungId: string, geheimTop: string, offenTop: string;

  before(async () => {
    const s = await prisma.sitzung.create({
      data: { titel: "BR-Sitzung", sitzungsdatum: new Date(), erstelltVonId: env.ids.VORSITZ },
    });
    sitzungId = s.id;
    geheimTop = (await prisma.tOP.create({ data: { sitzungId, nummer: 1, titel: "GEHEIM-TOP Kündigung", vertraulich: true } })).id;
    offenTop  = (await prisma.tOP.create({ data: { sitzungId, nummer: 2, titel: "OFFEN-TOP Kantine" } })).id;
    await prisma.protocolBlock.create({ data: { sitzungId, typ: "TEXT", topId: geheimTop, inhalt: "GEHEIM-PROTOKOLL" } });
    await prisma.beschluss.create({ data: { topId: geheimTop, antragstext: "GEHEIM-BESCHLUSS", erstelltVonId: env.ids.VORSITZ } });
    await prisma.abstimmung.create({ data: { topId: geheimTop, rechtsgrundlage: "§ 102 BetrVG", fragestellung: "GEHEIM-ABSTIMMUNG", erstelltVonId: env.ids.VORSITZ } });
    await prisma.kommentar.create({ data: { topId: geheimTop, inhalt: "GEHEIM-KOMMENTAR", autorId: env.ids.VORSITZ } });
  });

  test("Sitzungsansicht zeigt nur den offenen TOP", async () => {
    const res = await anfrage(env, "JAV", "GET", `/api/sitzungen/${sitzungId}`);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /OFFEN-TOP/);
    assert.doesNotMatch(res.body, /GEHEIM/);
  });

  test("keine Unterroute der Sitzung verrät den vertraulichen TOP", async () => {
    const lecks: string[] = [];
    for (const konto of ["JAV", "SBV"] as const) {
      for (const r of env.routen.filter(r => r.methode === "GET" && /^\/api\/(sitzungen\/:(id|sitzungId)\/|tops\/:topId\/)/.test(r.pfad))) {
        const url = r.pfad
          .replace(/:(id|sitzungId)/, sitzungId)
          .replace(":topId", geheimTop)
          .replace(":versionNummer", "1")
          .replace(/:[A-Za-z]+/g, "x");
        const res = await anfrage(env, konto, "GET", url);
        if (res.statusCode === 200 && res.body.includes("GEHEIM")) lecks.push(`${konto} ${r.pfad}`);
      }
    }
    assert.deepEqual(lecks, []);
  });

  test("PDF-Dateien: TOP-Auszug nur für offene TOPs, Paket und Scans gesperrt", async () => {
    for (const konto of ["JAV", "SBV"] as const) {
      assert.equal(await status(konto, "GET", `/api/sitzungen/${sitzungId}/tops/${geheimTop}/auszug`), 404, konto);
      assert.equal(await status(konto, "GET", `/api/sitzungen/${sitzungId}/tops/${offenTop}/auszug`), 200, konto);
      assert.equal(await status(konto, "GET", `/api/sitzungen/${sitzungId}/sitzungspaket`), 403, konto);
      assert.equal(await status(konto, "GET", `/api/sitzungen/${sitzungId}/scans/PROTOKOLL_UNTERSCHRIFTEN/download`), 403, konto);
    }
  });

  test("Protokoll-PDF: JAV/SBV bekommen die geschwärzte Fassung ohne den vertraulichen TOP", async () => {
    await prisma.tOP.update({ where: { id: offenTop }, data: { ergebnis: "OFFEN-ERGEBNIS" } });
    await prisma.sitzungVersion.create({
      data: { sitzungId, versionNummer: "2.1", typ: "PROTOKOLL_FINAL", readonly: true, pdfPfad: "/nicht/vorhanden.pdf", pdfDateiname: "protokoll.pdf", erstelltVonId: env.ids.VORSITZ },
    });
    const { PDFParse } = await import("pdf-parse");
    for (const konto of ["JAV", "SBV"] as const) {
      const res = await anfrage(env, konto, "GET", `/api/sitzungen/${sitzungId}/pdf/2.1`);
      assert.equal(res.statusCode, 200, `${konto}: ${res.body.slice(0, 200)}`);
      assert.match(String(res.headers["content-disposition"]), /geschwaerzt/);
      const text = (await new PDFParse({ data: res.rawPayload }).getText()).text;
      assert.match(text, /OFFEN-TOP/);
      assert.match(text, /geschwärzt/);
      assert.doesNotMatch(text, /GEHEIM/);
    }
    // Mitglieder bekommen weiter die gespeicherte Originalfassung (hier nicht vorhanden → 404)
    assert.equal(await status("MITGLIED", "GET", `/api/sitzungen/${sitzungId}/pdf/2.1`), 404);
  });

  test("Mitglied sieht den vertraulichen TOP samt Beschluss und Auszug", async () => {
    const res = await anfrage(env, "MITGLIED", "GET", `/api/sitzungen/${sitzungId}`);
    assert.match(res.body, /GEHEIM-TOP/);
    const beschluesse = await anfrage(env, "MITGLIED", "GET", `/api/sitzungen/${sitzungId}/tops/${geheimTop}/beschluesse`);
    assert.match(beschluesse.body, /GEHEIM-BESCHLUSS/);
    assert.equal(await status("MITGLIED", "GET", `/api/sitzungen/${sitzungId}/tops/${geheimTop}/auszug`), 200);
  });
});

describe("Token-Widerruf", () => {
  // Eigene Konten, damit die hochgezählte Token-Version die gemeinsamen Testkonten nicht trifft
  let zaehler = 0;
  async function eigenesKonto(rolle: Role = Role.MITGLIED) {
    const b = await prisma.benutzer.create({
      data: { email: `widerruf${++zaehler}@test.lokal`, name: "Widerruf", passwortHash: hashPassword("Altes-Passwort-1"), rolle },
    });
    return { id: b.id, token: env.app.jwt.sign({ sub: b.id, email: b.email, rolle }) };
  }
  const mitToken = (token: string, method: string, url: string, payload?: object) =>
    env.app.inject({ method: method as "GET", url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

  test("Abmelden macht den Token ungültig und landet im Audit-Log", async () => {
    const { id, token } = await eigenesKonto();
    assert.equal((await mitToken(token, "GET", "/api/auth/me")).statusCode, 200);
    assert.equal((await mitToken(token, "POST", "/api/auth/logout")).statusCode, 200);
    assert.equal((await mitToken(token, "GET", "/api/auth/me")).statusCode, 401);
    assert.equal(await prisma.auditLog.count({ where: { aktion: "LOGOUT", benutzerId: id } }), 1);
  });

  test("JAV darf sich abmelden", async () => {
    const { token } = await eigenesKonto(Role.JAV);
    assert.equal((await mitToken(token, "POST", "/api/auth/logout")).statusCode, 200);
    assert.equal((await mitToken(token, "GET", "/api/auth/me")).statusCode, 401);
  });

  test("nach dem Abmelden liefert der Login wieder einen gültigen Token", async () => {
    const { token } = await eigenesKonto();
    await mitToken(token, "POST", "/api/auth/logout");
    const login = await env.app.inject({
      method: "POST", url: "/api/auth/login",
      payload: { email: `widerruf${zaehler}@test.lokal`, passwort: "Altes-Passwort-1" },
    });
    assert.equal(login.statusCode, 200, login.body);
    assert.equal((await mitToken(login.json().token, "GET", "/api/auth/me")).statusCode, 200);
  });

  test("eigenes Passwort ändern: alter Token ungültig, neuer aus der Antwort gilt", async () => {
    const { token } = await eigenesKonto();
    const falsch = await mitToken(token, "PATCH", "/api/auth/passwort", { aktuellesPasswort: "falsch", neuesPasswort: "Neues-Passwort-1" });
    assert.equal(falsch.statusCode, 400, "falsches Passwort darf nicht als 401 (= abgemeldet) ankommen");

    const res = await mitToken(token, "PATCH", "/api/auth/passwort", { aktuellesPasswort: "Altes-Passwort-1", neuesPasswort: "Neues-Passwort-1" });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await mitToken(token, "GET", "/api/auth/me")).statusCode, 401);
    assert.equal((await mitToken(res.json().token, "GET", "/api/auth/me")).statusCode, 200);
  });

  test("Passwort-Reset durch den Vorsitz beendet die Sitzungen des Betroffenen", async () => {
    const { id, token } = await eigenesKonto();
    const res = await anfrage(env, "VORSITZ", "POST", `/api/benutzer/${id}/passwort-reset`, { neuesPasswort: "Vom-Vorsitz-1" });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await mitToken(token, "GET", "/api/auth/me")).statusCode, 401);
  });

  test("Passwort-Reset per Link beendet die bestehenden Sitzungen", async () => {
    const { id, token } = await eigenesKonto();
    await prisma.passwortReset.create({ data: { benutzerId: id, token: `reset-${id}`, gueltigBis: new Date(Date.now() + 60_000) } });
    const res = await env.app.inject({
      method: "POST", url: "/api/auth/passwort-reset",
      payload: { token: `reset-${id}`, neuesPasswort: "Per-Link-1234" },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await mitToken(token, "GET", "/api/auth/me")).statusCode, 401);
  });
});

describe("Zwei-Faktor-Anmeldung und Mein Konto", () => {
  // Eigene Konten wie beim Token-Widerruf; jede Anmeldung von einer eigenen IP,
  // damit das Login-Limit (10 je 10 Minuten) die Tests nicht ausbremst
  let nr = 0;
  const PW = "Testpasswort-2FA";
  async function konto(rolle: Role = Role.MITGLIED) {
    const email = `zwei${++nr}@test.lokal`;
    const b = await prisma.benutzer.create({ data: { email, name: `Zwei ${nr}`, passwortHash: hashPassword(PW), rolle } });
    return { id: b.id, email, token: env.app.jwt.sign({ sub: b.id, email, rolle }) };
  }
  const mit = (token: string | null, method: string, url: string, payload?: object) =>
    env.app.inject({
      method: method as "GET", url, remoteAddress: `10.9.${Math.floor(nr / 250)}.${(nr * 7 + url.length) % 250}`,
      headers: token ? { authorization: `Bearer ${token}` } : {}, ...(payload ? { payload } : {}),
    });
  const login = (email: string) => mit(null, "POST", "/api/auth/login", { email, passwort: PW });
  const richtlinie = (modus: "aus" | "freiwillig", pflichtRollen: Role[] = []) =>
    anfrage(env, "ADMIN", "PUT", "/api/einstellungen/zwei-faktor", { modus, pflichtRollen });
  const geheimnisAus = (res: { json(): { geheimnis: string } }) => res.json().geheimnis.replace(/\s/g, "");

  /** Richtet die 2FA über „Mein Konto“ ein und gibt Geheimnis, Codes und neuen Token zurück */
  async function einrichten(token: string) {
    const start = await mit(token, "POST", "/api/konto/zwei-faktor/start", { passwort: PW });
    assert.equal(start.statusCode, 200, start.body);
    assert.match(start.json().qrCode, /^data:image\/png;base64,/);
    const geheimnis = geheimnisAus(start);
    const fertig = await mit(token, "POST", "/api/konto/zwei-faktor/bestaetigen", { code: codeFuer(geheimnis) });
    assert.equal(fertig.statusCode, 200, fertig.body);
    return { geheimnis, codes: fertig.json().wiederherstellungscodes as string[], token: fertig.json().token as string };
  }

  after(() => richtlinie("aus"));

  test("Standard ist aus: Einrichten wird abgelehnt", async () => {
    const k = await konto();
    assert.equal((await anfrage(env, "MITGLIED", "GET", "/api/einstellungen/zwei-faktor")).json().modus, "aus");
    assert.equal((await mit(k.token, "POST", "/api/konto/zwei-faktor/start", { passwort: PW })).statusCode, 403);
  });

  test("nur der Admin stellt die Richtlinie ein", async () => {
    for (const k of ["VORSITZ", "MITGLIED"] as const) {
      assert.equal((await anfrage(env, k, "PUT", "/api/einstellungen/zwei-faktor", { modus: "freiwillig", pflichtRollen: [] })).statusCode, 403, k);
    }
    assert.equal((await richtlinie("freiwillig")).statusCode, 200);
  });

  test("Einrichten, dann Anmeldung nur mit Code; Zwischen-Token öffnet keine API", async () => {
    await richtlinie("freiwillig");
    const k = await konto();
    const { geheimnis, codes, token } = await einrichten(k.token);
    assert.equal(codes.length, 10);
    assert.equal((await mit(k.token, "GET", "/api/auth/me")).statusCode, 401, "alte Sitzung endet beim Einrichten");
    assert.equal((await mit(token, "GET", "/api/auth/me")).statusCode, 200);

    const schritt1 = await login(k.email);
    assert.equal(schritt1.statusCode, 200, schritt1.body);
    assert.equal(schritt1.json().token, undefined, "ohne Code kein Token");
    const zwischen = schritt1.json().zwischenToken as string;
    assert.equal((await mit(zwischen, "GET", "/api/auth/me")).statusCode, 401);
    assert.equal((await mit(zwischen, "GET", "/api/konto")).statusCode, 401);

    assert.equal((await mit(null, "POST", "/api/auth/login/zweiter-faktor", { zwischenToken: zwischen, code: "000000" })).statusCode, 400);
    // Beim Einrichten wurde der aktuelle Schritt verbraucht – die App zeigt 30 s später den nächsten
    const code = codeFuer(geheimnis, aktuellerSchritt() + 1);
    const ok = await mit(null, "POST", "/api/auth/login/zweiter-faktor", { zwischenToken: zwischen, code });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal((await mit(ok.json().token, "GET", "/api/auth/me")).statusCode, 200);

    const nochmal = await mit(null, "POST", "/api/auth/login/zweiter-faktor", { zwischenToken: zwischen, code });
    assert.equal(nochmal.statusCode, 400, "derselbe Code geht nur einmal");
  });

  test("Wiederherstellungscode geht genau einmal", async () => {
    await richtlinie("freiwillig");
    const k = await konto();
    const { codes } = await einrichten(k.token);
    const z1 = (await login(k.email)).json().zwischenToken;
    const ok = await mit(null, "POST", "/api/auth/login/zweiter-faktor", { zwischenToken: z1, code: codes[0].toUpperCase() });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(ok.json().restCodes, 9);
    const z2 = (await login(k.email)).json().zwischenToken;
    assert.equal((await mit(null, "POST", "/api/auth/login/zweiter-faktor", { zwischenToken: z2, code: codes[0] })).statusCode, 400);
  });

  test("ausgeschaltet: wer sie eingerichtet hat, meldet sich wieder nur mit Passwort an", async () => {
    await richtlinie("freiwillig");
    const k = await konto();
    await einrichten(k.token);
    await richtlinie("aus");
    const res = await login(k.email);
    assert.equal(res.statusCode, 200);
    assert.ok(res.json().token, res.body);
  });

  test("Pflicht für die Rolle: Einrichten beim Login, Abschalten gesperrt", async () => {
    await richtlinie("freiwillig", [Role.STELLVERTRETER]);
    const k = await konto(Role.STELLVERTRETER);
    const schritt1 = await login(k.email);
    assert.equal(schritt1.json().einrichtungNoetig, true, schritt1.body);
    const zwischen = schritt1.json().zwischenToken as string;

    // Der Einrichtungs-Token taugt nicht für den Code-Schritt
    assert.equal((await mit(null, "POST", "/api/auth/login/zweiter-faktor", { zwischenToken: zwischen, code: "123456" })).statusCode, 401);

    const start = await mit(null, "POST", "/api/auth/login/einrichten/start", { zwischenToken: zwischen });
    assert.equal(start.statusCode, 200, start.body);
    const fertig = await mit(null, "POST", "/api/auth/login/einrichten/bestaetigen", { zwischenToken: zwischen, code: codeFuer(geheimnisAus(start)) });
    assert.equal(fertig.statusCode, 200, fertig.body);
    assert.equal(fertig.json().wiederherstellungscodes.length, 10);
    const token = fertig.json().token as string;
    assert.equal((await mit(token, "GET", "/api/auth/me")).statusCode, 200);
    assert.equal((await mit(token, "DELETE", "/api/konto/zwei-faktor", { passwort: PW })).statusCode, 403);
    // Einrichtungs-Token ist danach verbraucht (Token-Version hochgezählt)
    assert.equal((await mit(null, "POST", "/api/auth/login/einrichten/start", { zwischenToken: zwischen })).statusCode, 401);
  });

  test("freiwillig: Abschalten nur mit Passwort", async () => {
    await richtlinie("freiwillig");
    const k = await konto();
    const { token } = await einrichten(k.token);
    assert.equal((await mit(token, "DELETE", "/api/konto/zwei-faktor", { passwort: "falsch" })).statusCode, 400);
    assert.equal((await mit(token, "DELETE", "/api/konto/zwei-faktor", { passwort: PW })).statusCode, 200);
    assert.ok((await login(k.email)).json().token);
  });

  test("Vorsitz setzt die 2FA zurück und beendet die Sitzungen; Mitglieder sehen den Status nicht", async () => {
    await richtlinie("freiwillig");
    const k = await konto();
    const { token } = await einrichten(k.token);

    const liste = await anfrage(env, "MITGLIED", "GET", "/api/benutzer");
    assert.equal(liste.json().find((b: { id: string }) => b.id === k.id).zweiFaktorAktiv, undefined);
    const leitung = await anfrage(env, "VORSITZ", "GET", "/api/benutzer");
    assert.equal(leitung.json().find((b: { id: string }) => b.id === k.id).zweiFaktorAktiv, true);

    assert.equal((await anfrage(env, "VORSITZ", "POST", `/api/benutzer/${k.id}/zwei-faktor-zuruecksetzen`)).statusCode, 200);
    assert.equal((await mit(token, "GET", "/api/auth/me")).statusCode, 401);
    assert.ok((await login(k.email)).json().token, "danach wieder nur mit Passwort");
  });

  test("Anmelde-E-Mail ändern nur mit Passwort und nur, wenn der Name vor dem @ frei ist", async () => {
    const k = await konto();
    assert.equal((await mit(k.token, "PATCH", "/api/konto/email", { email: "neu-zwei@test.lokal", passwort: "falsch" })).statusCode, 400);
    assert.equal((await mit(k.token, "PATCH", "/api/konto/email", { email: "mitglied@anders.lokal", passwort: PW })).statusCode, 409);
    const ok = await mit(k.token, "PATCH", "/api/konto/email", { email: "Neu-Zwei@Test.lokal", passwort: PW });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal((await prisma.benutzer.findUnique({ where: { id: k.id } }))!.email, "neu-zwei@test.lokal");
    assert.equal(await prisma.auditLog.count({ where: { aktion: "EMAIL_GEAENDERT", benutzerId: k.id } }), 1);
  });

  test("JAV sieht und ändert das eigene Konto", async () => {
    const k = await konto(Role.JAV);
    const res = await mit(k.token, "GET", "/api/konto");
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().email, k.email);
    assert.equal((await mit(k.token, "PATCH", "/api/konto/einladung-email", { einladungEmail: "jav-zwei@test.lokal" })).statusCode, 200);
  });

  test("Überall abmelden: alter Token ungültig, neuer gilt", async () => {
    const k = await konto();
    const res = await mit(k.token, "POST", "/api/konto/abmelden-ueberall");
    assert.equal(res.statusCode, 200);
    assert.equal((await mit(k.token, "GET", "/api/auth/me")).statusCode, 401);
    assert.equal((await mit(res.json().token, "GET", "/api/auth/me")).statusCode, 200);
  });
});

describe("Kostenübersicht (§ 40)", () => {
  const JAHR = 2026;
  const posten = async (konto: Konto = "VORSITZ") => (await anfrage(env, konto, "GET", `/api/kosten?jahr=${JAHR}`)).json();

  test("lesen Mitglieder und aktive Vertretung, schreiben nur Vorsitz/Stellvertretung", async () => {
    for (const k of ["MITGLIED", "ERSATZ_VERTRETUNG", "VORSITZ", "STELLVERTRETER"] as const) {
      assert.equal(await status(k, "GET", `/api/kosten?jahr=${JAHR}`), 200, k);
    }
    assert.equal(await status("ERSATZMITGLIED", "GET", "/api/kosten"), 403);
    const neu = { datum: `${JAHR}-03-01`, art: "SACHMITTEL", bezeichnung: "Kommentar BetrVG", betragCent: 12900 };
    assert.equal(await status("MITGLIED", "POST", "/api/kosten", neu), 403);
    assert.equal(await status("STELLVERTRETER", "POST", "/api/kosten", neu), 201);
  });

  test("abgelehnte Posten zählen nicht zur Summe", async () => {
    const vorher = (await posten()).summen.gesamt as number;
    const res = await anfrage(env, "VORSITZ", "POST", "/api/kosten",
      { datum: `${JAHR}-05-02`, art: "SACHVERSTAENDIGER", bezeichnung: "Gutachten Schichtplan", betragCent: 250000, status: "ABGELEHNT" });
    assert.equal(res.statusCode, 201, res.body);
    const nachher = await posten();
    assert.equal(nachher.summen.gesamt, vorher);
    assert.equal(nachher.summen.nachStatus.ABGELEHNT >= 250000, true);
  });

  test("BR-Schulung erscheint automatisch; Betrag gehört der Schulung, Status der Kostenübersicht", async () => {
    const q = await prisma.qualifikation.create({ data: { name: "BR-Grundlagen Test", brSchulung: false } });
    const t = await prisma.schulungstermin.create({
      data: { qualifikationId: q.id, datum: new Date(Date.UTC(JAHR, 8, 15)), kosten: 450.5, anbieter: "ver.di b+b", erstelltVonId: env.ids.VORSITZ },
    });
    const nichtDrin = (await posten()).posten.find((p: { schulungsterminId: string }) => p.schulungsterminId === t.id);
    assert.equal(nichtDrin, undefined, "ohne BR-Haken nicht in der Übersicht");

    assert.equal(await status("MITGLIED", "PATCH", "/api/kosten/br-schulungen", { qualifikationIds: [q.id] }), 403);
    assert.equal(await status("VORSITZ", "PATCH", "/api/kosten/br-schulungen", { qualifikationIds: [q.id] }), 200);
    const p = (await posten()).posten.find((x: { schulungsterminId: string }) => x.schulungsterminId === t.id);
    assert.ok(p, "BR-Schulung fehlt");
    assert.equal(p.betragCent, 45050);
    assert.equal(p.art, "SCHULUNG");
    assert.equal(p.ausSchulung, true);

    assert.equal(await status("VORSITZ", "PUT", `/api/kosten/${p.id}`, { betragCent: 1 }), 400);
    assert.equal(await status("VORSITZ", "DELETE", `/api/kosten/${p.id}`), 400);
    assert.equal(await status("VORSITZ", "PUT", `/api/kosten/${p.id}`, { status: "ZUGESAGT" }), 200);

    // Kosten in der Schulung geändert: Betrag zieht nach, Status bleibt
    await prisma.schulungstermin.update({ where: { id: t.id }, data: { kosten: 500 } });
    const p2 = (await posten()).posten.find((x: { id: string }) => x.id === p.id);
    assert.equal(p2.betragCent, 50000);
    assert.equal(p2.status, "ZUGESAGT");

    // Abgesagt: fällt heraus
    await prisma.schulungstermin.update({ where: { id: t.id }, data: { status: "ABGESAGT" } });
    assert.equal((await posten()).posten.find((x: { id: string }) => x.id === p.id), undefined);
  });

  test("Rechnung: fremdes vertrauliches Dokument nur ohne Titel; Beschluss muss finalisiert sein", async () => {
    const dok = await dokumentAnlegen("GEHEIME-RECHNUNG", "VORSITZ", true);
    const res = await anfrage(env, "VORSITZ", "POST", "/api/kosten",
      { datum: `${JAHR}-06-01`, art: "RECHTSANWALT", bezeichnung: "Beratung", betragCent: 80000, dokumentId: dok.id });
    assert.equal(res.statusCode, 201, res.body);
    const mitglied = await anfrage(env, "MITGLIED", "GET", `/api/kosten?jahr=${JAHR}`);
    assert.doesNotMatch(mitglied.body, /GEHEIME-RECHNUNG/);
    assert.match((await anfrage(env, "VORSITZ", "GET", `/api/kosten?jahr=${JAHR}`)).body, /GEHEIME-RECHNUNG/);

    const sitzung = await prisma.sitzung.create({ data: { titel: "Kosten-Sitzung", sitzungsdatum: new Date(), erstelltVonId: env.ids.VORSITZ } });
    const top = await prisma.tOP.create({ data: { sitzungId: sitzung.id, nummer: 1, titel: "Anwalt beauftragen" } });
    const offen = await prisma.beschluss.create({ data: { topId: top.id, antragstext: "Anwalt beauftragen", erstelltVonId: env.ids.VORSITZ } });
    assert.equal(await status("VORSITZ", "PUT", `/api/kosten/${res.json().id}`, { beschlussId: offen.id }), 400);
    await prisma.beschluss.update({ where: { id: offen.id }, data: { finalisiert: true, finalisiertAm: new Date() } });
    assert.equal(await status("VORSITZ", "PUT", `/api/kosten/${res.json().id}`, { beschlussId: offen.id }), 200);
  });

  test("Export: CSV für Excel (BOM, Semikolon, keine Formeln), PDF", async () => {
    await anfrage(env, "VORSITZ", "POST", "/api/kosten",
      { datum: `${JAHR}-07-01`, art: "SONSTIGES", bezeichnung: "=HYPERLINK(\"x\")", betragCent: 1050 });
    const csv = await anfrage(env, "MITGLIED", "GET", `/api/kosten/export.csv?jahr=${JAHR}`);
    assert.equal(csv.statusCode, 200);
    assert.ok(csv.body.startsWith("﻿Datum;Art;"), csv.body.slice(0, 40));
    assert.match(csv.body, /;10,50;/);
    assert.doesNotMatch(csv.body, /;=HYPERLINK/);
    const pdf = await anfrage(env, "MITGLIED", "GET", `/api/kosten/export.pdf?jahr=${JAHR}`);
    assert.equal(pdf.statusCode, 200);
    assert.equal(pdf.headers["content-type"], "application/pdf");
  });
});

describe("Abwesenheitskalender und Verfügbarkeit zur Ladung", () => {
  const TAG = "2027-03-10";
  let sitzungId: string;
  let eintragMitglied: string;

  before(async () => {
    sitzungId = (await prisma.sitzung.create({
      data: { titel: "Kalender-Testsitzung", sitzungsdatum: new Date(`${TAG}T09:00:00Z`), erstelltVonId: env.ids.VORSITZ },
    })).id;
  });

  test("eigene Abwesenheit eintragen; für andere nur Vorsitz/Stellvertretung", async () => {
    const res = await anfrage(env, "MITGLIED", "POST", "/api/abwesenheiten", { von: "2027-03-08", bis: "2027-03-12", grund: "KRANKHEIT" });
    assert.equal(res.statusCode, 201, res.body);
    eintragMitglied = res.json().id;
    assert.equal(await status("MITGLIED", "POST", "/api/abwesenheiten", { benutzerId: env.ids.VORSITZ, von: TAG, grund: "URLAUB" }), 403);
    assert.equal(await status("STELLVERTRETER", "POST", "/api/abwesenheiten", { benutzerId: env.ids.JAV, von: TAG, bis: TAG, grund: "SCHULUNG" }), 201);
    assert.equal(await status("ERSATZMITGLIED", "POST", "/api/abwesenheiten", { von: TAG, bis: TAG, grund: "URLAUB" }), 201);
    assert.equal(await status("MITGLIED", "POST", "/api/abwesenheiten", { von: "2027-03-12", bis: "2027-03-01", grund: "URLAUB" }), 400);
    assert.equal(await status("MITGLIED", "POST", "/api/abwesenheiten", { von: TAG, bis: TAG, grund: "QUATSCH" }), 400);
    assert.equal(await status("JAV", "GET", `/api/abwesenheiten?von=${TAG}&bis=${TAG}`), 403);
  });

  test("Grund sehen nur Betroffene und Vorsitz; Ersatzmitglied ohne Vertretung nur Eigenes", async () => {
    const liste = async (k: Konto) => (await anfrage(env, k, "GET", `/api/abwesenheiten?von=2027-03-01&bis=2027-03-31`)).json();
    const grundVon = (l: { eintraege: { id: string; grund: string | null }[] }) => l.eintraege.find(e => e.id === eintragMitglied)?.grund;
    assert.equal(grundVon(await liste("MITGLIED")), "KRANKHEIT");
    assert.equal(grundVon(await liste("VORSITZ")), "KRANKHEIT");
    assert.equal(grundVon(await liste("STELLVERTRETER")), "KRANKHEIT");
    assert.equal(grundVon(await liste("ERSATZ_VERTRETUNG")), null, "Vertretung sieht abwesend, aber keinen Grund");
    assert.doesNotMatch(JSON.stringify(await liste("ERSATZ_VERTRETUNG")), /KRANKHEIT/);
    const ersatz = await liste("ERSATZMITGLIED");
    assert.equal(ersatz.eintraege.length, 1);
    assert.equal(ersatz.eintraege[0].benutzer.id, env.ids.ERSATZMITGLIED);
    assert.equal(ersatz.sitzungen.length, 1);
  });

  test("fremde Einträge ändern/löschen nur Vorsitz", async () => {
    assert.equal(await status("ERSATZ_VERTRETUNG", "DELETE", `/api/abwesenheiten/${eintragMitglied}`), 403);
    assert.equal(await status("ERSATZ_VERTRETUNG", "PUT", `/api/abwesenheiten/${eintragMitglied}`, { von: TAG, bis: TAG, grund: "URLAUB" }), 403);
    assert.equal(await status("MITGLIED", "PUT", `/api/abwesenheiten/${eintragMitglied}`, { von: "2027-03-08", bis: "2027-03-12", grund: "KRANKHEIT" }), 200);
  });

  test("Verfügbarkeit: abwesend erkannt, verfügbares Ersatzmitglied vorgeschlagen, Grund geschützt", async () => {
    assert.equal(await status("JAV", "GET", `/api/sitzungen/${sitzungId}/verfuegbarkeit`), 403);
    assert.equal(await status("ERSATZMITGLIED", "GET", `/api/sitzungen/${sitzungId}/verfuegbarkeit`), 403);
    const v = (await anfrage(env, "ERSATZ_VERTRETUNG", "GET", `/api/sitzungen/${sitzungId}/verfuegbarkeit`)).json();
    const m = v.mitglieder.find((x: { benutzerId: string }) => x.benutzerId === env.ids.MITGLIED);
    assert.equal(m.abwesend, true);
    assert.equal(m.grund, null);
    assert.deepEqual(v.ersatzPlan.map((p: { fuer: { id: string } }) => p.fuer.id), [env.ids.MITGLIED]);
    // Das andere Ersatzmitglied ist selbst im Urlaub → nie vorgeschlagen
    assert.ok(v.ersatzPlan[0].ersatz);
    assert.notEqual(v.ersatzPlan[0].ersatz.id, env.ids.ERSATZMITGLIED);
    const soll = v.prognose.sollStaerke;
    assert.equal(v.prognose.ohneNeuenErsatz, soll - 1);
    assert.equal(v.prognose.mitErsatz, soll);
    assert.equal(v.prognose.mindestens, Math.ceil(soll / 2));

    const vorsitz = (await anfrage(env, "VORSITZ", "GET", `/api/sitzungen/${sitzungId}/verfuegbarkeit`)).json();
    assert.equal(vorsitz.mitglieder.find((x: { benutzerId: string }) => x.benutzerId === env.ids.MITGLIED).grund, "KRANKHEIT");
  });

  test("Übernehmen setzt Verhindert, Kommt und lädt Ersatz – danach nichts mehr offen", async () => {
    const res = await anfrage(env, "VORSITZ", "POST", `/api/sitzungen/${sitzungId}/verfuegbarkeit/uebernehmen`);
    assert.equal(res.statusCode, 200, res.body);
    const ergebnis = res.json();
    assert.equal(ergebnis.verhindert, 2);  // Mitglied + JAV
    assert.equal(ergebnis.ersatz, 1);
    const ladung = await prisma.anwesenheit.findMany({ where: { sitzungId } });
    const von = (k: Konto) => ladung.find(a => a.benutzerId === env.ids[k]);
    assert.equal(von("MITGLIED")?.status, "ABWESEND_ENTSCHULDIGT");
    assert.equal(von("JAV")?.status, "ABWESEND_ENTSCHULDIGT");
    assert.equal(von("VORSITZ")?.status, "ANWESEND");
    assert.equal(von("SBV")?.status, "ANWESEND");
    const geladenerErsatz = ladung.filter(a => a.status === "ERSATZ_FUER");
    assert.equal(geladenerErsatz.length, 1);
    assert.equal(geladenerErsatz[0].vertretungFuerId, env.ids.MITGLIED);
    assert.equal(von("ERSATZMITGLIED"), undefined, "abwesendes Ersatzmitglied nicht geladen");
    assert.equal(von("ADMIN"), undefined);

    const v = (await anfrage(env, "VORSITZ", "GET", `/api/sitzungen/${sitzungId}/verfuegbarkeit`)).json();
    assert.equal(v.offeneAenderungen, 0);
    assert.equal(v.ersatzPlan.length, 0);
    assert.equal(v.prognose.beschlussfaehig, true);
  });
});

describe("Aufgaben: private Aufgaben und Bearbeitungsrechte", () => {
  let privat: string, oeffentlich: string, privatesProjekt: string, kindImPrivaten: string;

  const aufgabeAnlegen = (titel: string, von: Konto, sichtbarkeit: "PRIVAT" | "OEFFENTLICH", extra: object = {}) =>
    prisma.aufgabe.create({ data: { titel, sichtbarkeit, erstelltVonId: env.ids[von], ...extra } });

  before(async () => {
    privat          = (await aufgabeAnlegen("PRIVAT-AUFGABE", "VORSITZ", "PRIVAT")).id;
    oeffentlich     = (await aufgabeAnlegen("OFFENE-AUFGABE", "VORSITZ", "OEFFENTLICH")).id;
    privatesProjekt = (await aufgabeAnlegen("PRIVATES-PROJEKT", "VORSITZ", "PRIVAT", { typ: "PROJEKT" })).id;
    kindImPrivaten  = (await aufgabeAnlegen("KIND-AUFGABE", "VORSITZ", "OEFFENTLICH", { oberProjektId: privatesProjekt })).id;
  });

  test("fremde private Aufgabe: Ändern und Löschen wie nicht vorhanden, nichts wird verraten", async () => {
    for (const konto of ["MITGLIED", "STELLVERTRETER", "ADMIN"] as const) {
      const patch = await anfrage(env, konto, "PATCH", `/api/aufgaben/${privat}`, {});
      assert.equal(patch.statusCode, 404, `${konto}: ${patch.body}`);
      assert.doesNotMatch(patch.body, /PRIVAT-AUFGABE/);
      assert.equal(await status(konto, "PATCH", `/api/aufgaben/${privat}`, { sichtbarkeit: "OEFFENTLICH" }), 404, konto);
      assert.equal(await status(konto, "DELETE", `/api/aufgaben/${privat}`), 404, konto);
    }
    const unveraendert = await prisma.aufgabe.findUnique({ where: { id: privat } });
    assert.equal(unveraendert?.sichtbarkeit, "PRIVAT");
  });

  test("eigene private Aufgabe bleibt bearbeitbar", async () => {
    assert.equal(await status("VORSITZ", "PATCH", `/api/aufgaben/${privat}`, { titel: "PRIVAT-AUFGABE" }), 200);
  });

  test("Sichtbarkeit ändert nur, wer die Aufgabe angelegt hat – derselbe Wert geht durch", async () => {
    assert.equal(await status("MITGLIED", "PATCH", `/api/aufgaben/${oeffentlich}`, { sichtbarkeit: "PRIVAT" }), 403);
    assert.equal(await status("MITGLIED", "PATCH", `/api/aufgaben/${oeffentlich}`, { sichtbarkeit: "OEFFENTLICH", titel: "OFFENE-AUFGABE" }), 200);
  });

  test("Ersatzmitglied ohne Vertretung liest nur, mit Vertretung darf es bearbeiten", async () => {
    assert.equal(await status("ERSATZMITGLIED", "PATCH", `/api/aufgaben/${oeffentlich}`, { titel: "x" }), 403);
    assert.equal(await status("ERSATZMITGLIED", "DELETE", `/api/aufgaben/${oeffentlich}`), 403);
    assert.equal(await status("ERSATZ_VERTRETUNG", "PATCH", `/api/aufgaben/${oeffentlich}`, { titel: "OFFENE-AUFGABE" }), 200);
  });

  test("Ersatzmitglied darf eigene und ihm zugewiesene Aufgaben bearbeiten", async () => {
    const eigene = (await aufgabeAnlegen("ERSATZ-EIGENE", "ERSATZMITGLIED", "OEFFENTLICH")).id;
    const zugewiesen = (await aufgabeAnlegen("ERSATZ-ZUGEWIESEN", "VORSITZ", "OEFFENTLICH", { zugewiesenAnId: env.ids.ERSATZMITGLIED })).id;
    assert.equal(await status("ERSATZMITGLIED", "PATCH", `/api/aufgaben/${zugewiesen}`, { erledigt: true }), 200);
    assert.equal(await status("ERSATZMITGLIED", "DELETE", `/api/aufgaben/${eigene}`), 200);
  });

  test("Liste verrät ein fremdes privates Projekt nicht über seine Unteraufgaben", async () => {
    const res = await anfrage(env, "MITGLIED", "GET", "/api/aufgaben");
    assert.equal(res.statusCode, 200, res.body);
    assert.doesNotMatch(res.body, /PRIVATES-PROJEKT/);
    assert.ok(!res.body.includes(privatesProjekt), "ID des privaten Projekts verraten");
    const kind = res.json().find((a: { id: string }) => a.id === kindImPrivaten);
    assert.equal(kind.oberProjektId, null);
    // Bearbeiten ohne Projekt (so schickt es das Formular) löst die Aufgabe nicht aus dem fremden Projekt
    assert.equal(await status("MITGLIED", "PATCH", `/api/aufgaben/${kindImPrivaten}`, { oberProjektId: "" }), 200);
    assert.equal((await prisma.aufgabe.findUnique({ where: { id: kindImPrivaten } }))?.oberProjektId, privatesProjekt);
    // Die Ersteller-Sicht bleibt vollständig
    const eigen = (await anfrage(env, "VORSITZ", "GET", "/api/aufgaben")).json();
    assert.equal(eigen.find((a: { id: string }) => a.id === kindImPrivaten).oberProjektId, privatesProjekt);
  });

  test("an ein fremdes privates Projekt lässt sich nichts hängen", async () => {
    assert.equal(await status("MITGLIED", "POST", "/api/aufgaben", { titel: "x", oberProjektId: privatesProjekt }), 400);
    assert.equal(await status("MITGLIED", "PATCH", `/api/aufgaben/${oeffentlich}`, { oberProjektId: privatesProjekt }), 400);
  });
});

describe("Globale Suche: Mitarbeiter erst ab Mitglied", () => {
  before(async () => {
    await prisma.mitarbeiter.create({ data: { vorname: "Suchtest", nachname: "Personal" } });
  });

  test("Ersatzmitglied ohne Vertretung findet keine Mitarbeiter, Mitglied und Vertretung schon", async () => {
    const treffer = async (konto: Konto) => (await anfrage(env, konto, "GET", "/api/suche?q=Suchtest")).json().mitarbeiter.length;
    assert.equal(await treffer("ERSATZMITGLIED"), 0);
    assert.equal(await treffer("ERSATZ_VERTRETUNG"), 1);
    assert.equal(await treffer("MITGLIED"), 1);
  });
});

describe("Mailversand: Zertifikat des Mailservers", () => {
  test("wird standardmäßig geprüft, nur SMTP_TLS_UNSICHER=true schaltet es ab", async () => {
    const { smtpTlsOptionen } = await import("../src/lib/mailer.js");
    assert.equal(smtpTlsOptionen({}).rejectUnauthorized, true);
    assert.equal(smtpTlsOptionen({ SMTP_TLS_UNSICHER: "false" }).rejectUnauthorized, true);
    assert.equal(smtpTlsOptionen({ SMTP_TLS_UNSICHER: "1" }).rejectUnauthorized, true);
    assert.equal(smtpTlsOptionen({ SMTP_TLS_UNSICHER: "true" }).rejectUnauthorized, false);
  });
});
