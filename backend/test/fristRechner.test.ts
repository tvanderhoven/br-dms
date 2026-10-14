/**
 * Fristberechnung (§§ 187, 188, 193 BGB) und Feiertage je Bundesland –
 * reine Rechnung, ohne Datenbank.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { feiertage, feiertagAm } from "../src/lib/feiertage.js";
import { berechneFristende, berlinerTag, tagesende } from "../src/lib/fristRechner.js";

const NW = { bundesland: "NW" } as const;

describe("Feiertage", () => {
  test("Ostern und abhängige Feiertage", () => {
    assert.equal(feiertagAm("2024-04-01", "NW"), "Ostermontag");
    assert.equal(feiertagAm("2025-04-18", "NW"), "Karfreitag");
    assert.equal(feiertagAm("2026-04-06", "NW"), "Ostermontag");
    assert.equal(feiertagAm("2026-05-14", "NW"), "Christi Himmelfahrt");
    assert.equal(feiertagAm("2026-05-25", "NW"), "Pfingstmontag");
    assert.equal(feiertagAm("2026-06-04", "NW"), "Fronleichnam");
  });

  test("Anzahl je Bundesland 2026", () => {
    const anzahl = (land: Parameters<typeof feiertage>[1]) => feiertage(2026, land).length;
    assert.equal(anzahl("NW"), 11);
    assert.equal(anzahl("BY"), 12);
    assert.equal(anzahl("SN"), 11);
    assert.equal(anzahl("BE"), 10);
    assert.equal(anzahl("HH"), 10);
    assert.equal(anzahl("TH"), 11);
    assert.equal(anzahl("BB"), 12);
  });

  test("Landesfeiertage gelten nur im eigenen Land", () => {
    assert.equal(feiertagAm("2026-06-04", "SN"), null);           // Fronleichnam
    assert.equal(feiertagAm("2026-06-04", "SN", ["FRONLEICHNAM"]), "Fronleichnam");
    assert.equal(feiertagAm("2026-08-15", "BY"), null);           // nur in kath. Gemeinden
    assert.equal(feiertagAm("2026-08-15", "BY", ["MARIAE_HIMMELFAHRT"]), "Mariä Himmelfahrt");
    assert.equal(feiertagAm("2026-08-15", "SL"), "Mariä Himmelfahrt");
    assert.equal(feiertagAm("2026-03-08", "BE"), "Internationaler Frauentag");
    assert.equal(feiertagAm("2022-03-08", "MV"), null);           // erst ab 2023
    assert.equal(feiertagAm("2017-10-31", "NW"), "Reformationstag");
    assert.equal(feiertagAm("2018-10-31", "NW"), null);
  });

  test("Buß- und Bettag: Mittwoch vor dem 23. November", () => {
    assert.equal(feiertagAm("2023-11-22", "SN"), "Buß- und Bettag");
    assert.equal(feiertagAm("2025-11-19", "SN"), "Buß- und Bettag");
    assert.equal(feiertagAm("2026-11-18", "SN"), "Buß- und Bettag");
    assert.equal(feiertagAm("2026-11-18", "BY"), null);
  });
});

describe("Zeitzone", () => {
  test("Kalendertag in deutscher Zeit, nicht UTC", () => {
    assert.equal(berlinerTag(new Date("2026-10-12T22:30:00Z")), "2026-10-13");   // 00:30 MESZ
    assert.equal(berlinerTag(new Date("2026-12-31T23:30:00Z")), "2027-01-01");   // 00:30 MEZ
  });

  test("Tagesende in Sommer- und Winterzeit", () => {
    assert.equal(tagesende("2026-10-19").toISOString(), "2026-10-19T21:59:59.999Z");
    assert.equal(tagesende("2026-11-30").toISOString(), "2026-11-30T22:59:59.999Z");
    assert.equal(tagesende("2026-10-25").toISOString(), "2026-10-25T22:59:59.999Z");   // Tag der Umstellung
  });
});

describe("Fristende", () => {
  const zugang = (s: string) => new Date(s);

  test("§ 102 ordentlich: Zugang Montag → Montag der Folgewoche 24:00 Uhr", () => {
    const f = berechneFristende(zugang("2026-10-12T08:00:00Z"), { wochen: 1 }, NW);
    assert.equal(f.letzterTag, "2026-10-19");
    assert.deepEqual(f.verschoben, []);
    assert.equal(f.ende.toISOString(), "2026-10-19T21:59:59.999Z");
  });

  test("Uhrzeit des Zugangs spielt keine Rolle (§ 187 Abs. 1 BGB)", () => {
    const frueh = berechneFristende(zugang("2026-10-12T05:00:00Z"), { wochen: 1 }, NW);
    const spaet = berechneFristende(zugang("2026-10-12T21:00:00Z"), { wochen: 1 }, NW);
    assert.equal(frueh.ende.getTime(), spaet.ende.getTime());
  });

  test("Zugang kurz nach Mitternacht deutscher Zeit zählt zum neuen Tag", () => {
    const f = berechneFristende(zugang("2026-10-12T22:30:00Z"), { wochen: 1 }, NW);
    assert.equal(f.letzterTag, "2026-10-20");
  });

  test("§ 102 außerordentlich: Ende am Sonntag → Montag (§ 193 BGB)", () => {
    const f = berechneFristende(zugang("2026-10-15T09:00:00Z"), { tage: 3 }, NW);
    assert.equal(f.rechnerischerTag, "2026-10-18");
    assert.equal(f.letzterTag, "2026-10-19");
    assert.deepEqual(f.verschoben, [{ tag: "2026-10-18", grund: "Sonntag" }]);
  });

  test("Karfreitag + Wochenende + Ostermontag → Dienstag", () => {
    const f = berechneFristende(zugang("2026-03-27T09:00:00Z"), { wochen: 1 }, NW);
    assert.equal(f.letzterTag, "2026-04-07");
    assert.deepEqual(f.verschoben.map(v => v.grund), ["Karfreitag", "Samstag", "Sonntag", "Ostermontag"]);
  });

  test("Fronleichnam verschiebt nur, wo er Feiertag ist", () => {
    const z = zugang("2026-05-28T09:00:00Z");
    assert.equal(berechneFristende(z, { wochen: 1 }, NW).letzterTag, "2026-06-05");
    assert.equal(berechneFristende(z, { wochen: 1 }, { bundesland: "SN" }).letzterTag, "2026-06-04");
    assert.equal(berechneFristende(z, { wochen: 1 }, { bundesland: "SN", zusatz: ["FRONLEICHNAM"] }).letzterTag, "2026-06-05");
  });

  test("Samstag, der zugleich Feiertag ist, nennt beides", () => {
    const f = berechneFristende(zugang("2026-09-30T08:30:00Z"), { tage: 3 }, NW);
    assert.equal(f.letzterTag, "2026-10-05");
    assert.deepEqual(f.verschoben.map(v => v.grund), ["Samstag (Tag der Deutschen Einheit)", "Sonntag"]);
  });

  test("Frist über die Zeitumstellung hinweg", () => {
    const f = berechneFristende(zugang("2026-10-22T09:00:00Z"), { wochen: 1 }, NW);
    assert.equal(f.letzterTag, "2026-10-29");
    assert.equal(f.ende.toISOString(), "2026-10-29T22:59:59.999Z");
  });

  test("ungültige Dauer", () => {
    assert.throws(() => berechneFristende(new Date(), {}, NW));
    assert.throws(() => berechneFristende(new Date(), { tage: -1 }, NW));
  });
});
