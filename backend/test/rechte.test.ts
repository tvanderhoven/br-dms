/**
 * Rollentests über ALLE Routen
 *
 * Die Routen werden beim Start der App eingesammelt – eine neue Route ist also
 * automatisch mit dabei und muss in der Rechte-Übersicht (rechte-uebersicht.json)
 * auftauchen, sonst schlägt der Test fehl. So kann kein Modul versehentlich offen
 * bleiben oder still seine Mindestrolle ändern.
 *
 * Geprüft wird nur die Richtung „abgewiesen“ – abgewiesene Anfragen erreichen den
 * eigentlichen Handler nie und ändern deshalb nichts. Was erlaubt sein soll, prüft
 * die Hierarchie-Probe unten sowie szenarien.test.ts mit echten Daten.
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { Role } from "@prisma/client";
import { authenticate } from "../src/middleware/auth.js";
import { erfordert } from "../src/middleware/rbac.js";
import {
  adminInhaltszugriff, anfrage, KONTEN, type Konto, pfadFuellen, prisma, type Route,
  starteTestumgebung, type TestUmgebung,
} from "./hilfe.js";

const UEBERSICHT = new URL("./rechte-uebersicht.json", import.meta.url);

// Bewusst ohne Anmeldung erreichbar
const OEFFENTLICH = new Set([
  "GET /health",
  "POST /api/auth/login",
  "POST /api/auth/passwort-vergessen",
  "POST /api/auth/passwort-reset",
  "POST /api/kummerkasten",                 // anonymer Kummerkasten, rate-limited
  "GET /api/einstellungen/design",          // Farben schon für die Login-Seite
  "GET /api/einstellungen/protokoll/logo",  // als <img> eingebunden, ohne Token
]);

// Spiegel der Positivlisten aus middleware/auth.ts – absichtlich hier noch einmal
// ausgeschrieben, damit eine Änderung dort auch hier bewusst nachgezogen werden muss.
function javSbvErlaubt(r: Route): boolean {
  return r.pfad === "/api/auth/me" || (r.methode === "GET" && /^\/api\/sitzungen(\/|$)/.test(r.pfad));
}
function technikAdminErlaubt(r: Route): boolean {
  if (r.methode === "DELETE" && /^\/api\/gehaltstabelle\/(eintraege|alle)$/.test(r.pfad)) return true;
  return [/^\/api\/auth\//, /^\/api\/benutzer(\/|$)/, /^\/api\/einstellungen\//, /^\/api\/gesetze\//, /^\/api\/nachrichten(\/|$)/]
    .some(re => re.test(r.pfad));
}

const RANG: Record<Role, number> = {
  ADMIN: 4, VORSITZ: 3, STELLVERTRETER: 3, MITGLIED: 2, ERSATZMITGLIED: 1, JAV: 0, SBV: 0,
};

const schluessel = (r: Route) => `${r.methode} ${r.pfad}`;

let env: TestUmgebung;
let apiRouten: Route[];

before(async () => {
  env = await starteTestumgebung();
  apiRouten = env.routen.filter(r => !OEFFENTLICH.has(schluessel(r)));
});
after(async () => {
  await env?.app.close();
  await prisma.$disconnect();
});

async function abfragen(konto: Konto | null, r: Route) {
  const mitBody = ["POST", "PUT", "PATCH"].includes(r.methode);
  return anfrage(env, konto, r.methode, pfadFuellen(r.pfad), mitBody ? {} : undefined);
}

/** Erwartet bei allen Routen genau einen Status, sammelt Abweichungen statt beim ersten abzubrechen */
async function alleErwarten(konto: Konto | null, routen: Route[], status: number): Promise<void> {
  const abweichungen: string[] = [];
  for (const r of routen) {
    const res = await abfragen(konto, r);
    if (res.statusCode !== status) abweichungen.push(`${schluessel(r)} → ${res.statusCode} ${res.body.slice(0, 120)}`);
  }
  assert.deepEqual(abweichungen, [], `${konto ?? "ohne Anmeldung"}: erwartet ${status} bei`);
}

describe("Rechte-Übersicht", () => {
  test("jede Route steht mit ihrer Mindestrolle in rechte-uebersicht.json", () => {
    const ist: Record<string, string> = {};
    for (const r of [...env.routen].sort((a, b) => schluessel(a).localeCompare(schluessel(b)))) {
      ist[schluessel(r)] = OEFFENTLICH.has(schluessel(r)) ? "ÖFFENTLICH" : r.mindestRolle ?? "ANGEMELDET";
    }
    if (process.env.RECHTE_AKTUALISIEREN === "1") {
      writeFileSync(UEBERSICHT, JSON.stringify(ist, null, 2) + "\n");
      return;
    }
    const soll = JSON.parse(readFileSync(UEBERSICHT, "utf8")) as Record<string, string>;
    assert.deepEqual(ist, soll,
      "Rechte haben sich geändert. Falls gewollt: RECHTE_AKTUALISIEREN=1 bash backend/scripts/rollentests.sh");
  });

  test("öffentliche Routen gibt es wirklich (Liste nicht veraltet)", () => {
    const vorhanden = new Set(env.routen.map(schluessel));
    assert.deepEqual([...OEFFENTLICH].filter(s => !vorhanden.has(s)), []);
  });

  test("jede nicht-öffentliche Route hängt am Login-Hook", () => {
    assert.deepEqual(apiRouten.filter(r => !r.mitLogin).map(schluessel), []);
  });
});

describe("Ohne Anmeldung", () => {
  test("jede nicht-öffentliche Route antwortet 401", async () => {
    await alleErwarten(null, apiRouten, 401);
  });

  test("ein deaktiviertes Konto wird abgewiesen", async () => {
    await prisma.benutzer.update({ where: { id: env.ids.MITGLIED }, data: { aktiv: false } });
    try {
      const res = await anfrage(env, "MITGLIED", "GET", "/api/auth/me");
      assert.equal(res.statusCode, 401);
    } finally {
      await prisma.benutzer.update({ where: { id: env.ids.MITGLIED }, data: { aktiv: true } });
    }
  });

  test("ein gefälschtes Token wird abgewiesen", async () => {
    const res = await env.app.inject({
      method: "GET", url: "/api/auth/me",
      headers: { authorization: `Bearer ${env.token.VORSITZ.slice(0, -4)}abcd` },
    });
    assert.equal(res.statusCode, 401);
  });
});

describe("JAV und SBV (nur Sitzungen lesen)", () => {
  for (const konto of ["JAV", "SBV"] as const) {
    test(`${konto}: alles außer GET /api/sitzungen… antwortet 403`, async () => {
      await alleErwarten(konto, apiRouten.filter(r => !javSbvErlaubt(r)), 403);
    });

    test(`${konto}: Sitzungsrouten mit erfordert() bleiben trotzdem gesperrt`, async () => {
      await alleErwarten(konto, apiRouten.filter(r => javSbvErlaubt(r) && r.mindestRolle !== null), 403);
    });

    test(`${konto}: Sitzungsliste ist lesbar`, async () => {
      const res = await anfrage(env, konto, "GET", "/api/sitzungen");
      assert.equal(res.statusCode, 200, res.body);
    });
  }
});

describe("Mindestrollen aus erfordert()", () => {
  // Für jedes Konto: alle Routen, deren Mindestrolle über dem eigenen Rang liegt
  const faelle: [Konto, (r: Route) => boolean][] = [
    ["ERSATZMITGLIED",    r => r.mindestRolle !== null && RANG[r.mindestRolle] >= RANG.MITGLIED],
    ["ERSATZ_VERTRETUNG", r => r.mindestRolle !== null && RANG[r.mindestRolle] > RANG.MITGLIED],
    ["MITGLIED",          r => r.mindestRolle !== null && RANG[r.mindestRolle] > RANG.MITGLIED],
    ["VORSITZ",           r => r.mindestRolle === Role.ADMIN],
    ["STELLVERTRETER",    r => r.mindestRolle === Role.ADMIN],
  ];
  for (const [konto, gesperrt] of faelle) {
    test(`${konto}: Routen über dem eigenen Rang antworten 403`, async () => {
      const routen = apiRouten.filter(gesperrt);
      assert.ok(routen.length > 0, "keine Routen gefunden – Sammeln kaputt?");
      await alleErwarten(konto, routen, 403);
    });
  }

  test("abgewiesene Zugriffe landen im Audit-Log", async () => {
    const anzahl = await prisma.auditLog.count({ where: { aktion: "ZUGRIFF_VERWEIGERT", benutzerId: env.ids.MITGLIED } });
    assert.ok(anzahl > 0);
  });
});

describe("Hierarchie von erfordert() (beide Richtungen)", () => {
  // Eigene Mini-App mit denselben Hooks – hier darf der Handler laufen, er tut nichts
  test("jedes Konto kommt genau bis zu seinem Rang durch", async () => {
    const mini = Fastify();
    await mini.register(jwt, { secret: process.env.JWT_SECRET! });
    // Pfad unter /api/sitzungen, damit die zentrale JAV/SBV-Sperre GET hier nicht vorher greift
    for (const rolle of [Role.ERSATZMITGLIED, Role.MITGLIED, Role.VORSITZ, Role.ADMIN]) {
      mini.get(`/api/sitzungen/probe-${rolle}`, { preHandler: [authenticate, erfordert(rolle)] }, async () => ({ ok: true }));
    }
    await mini.ready();

    const erwartet: Record<Konto, Role[]> = {
      ERSATZMITGLIED:    [Role.ERSATZMITGLIED],
      ERSATZ_VERTRETUNG: [Role.ERSATZMITGLIED, Role.MITGLIED],
      MITGLIED:          [Role.ERSATZMITGLIED, Role.MITGLIED],
      VORSITZ:           [Role.ERSATZMITGLIED, Role.MITGLIED, Role.VORSITZ],
      STELLVERTRETER:    [Role.ERSATZMITGLIED, Role.MITGLIED, Role.VORSITZ],
      ADMIN:             [Role.ERSATZMITGLIED, Role.MITGLIED, Role.VORSITZ, Role.ADMIN],
      JAV:               [],
      SBV:               [],
    };
    const ist = {} as Record<Konto, Role[]>;
    for (const konto of KONTEN) {
      ist[konto] = [];
      for (const rolle of [Role.ERSATZMITGLIED, Role.MITGLIED, Role.VORSITZ, Role.ADMIN]) {
        const res = await mini.inject({
          method: "GET", url: `/api/sitzungen/probe-${rolle}`,
          headers: { authorization: `Bearer ${env.token[konto]}` },
        });
        if (res.statusCode === 200) ist[konto].push(rolle);
        else assert.equal(res.statusCode, 403, `${konto} → ${rolle}: ${res.body}`);
      }
    }
    await mini.close();
    assert.deepEqual(ist, erwartet);
  });
});

describe("Admin ohne Inhaltszugriff", () => {
  before(() => adminInhaltszugriff(false));
  after(() => adminInhaltszugriff(true));

  test("alles außer Technik (Benutzer, Einstellungen, Gesetze, eigene Nachrichten) antwortet 403", async () => {
    await alleErwarten("ADMIN", apiRouten.filter(r => !technikAdminErlaubt(r)), 403);
  });

  test("Benutzerverwaltung bleibt erreichbar", async () => {
    const res = await anfrage(env, "ADMIN", "GET", "/api/benutzer");
    assert.equal(res.statusCode, 200, res.body);
  });
});
