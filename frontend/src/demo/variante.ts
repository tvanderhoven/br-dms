/**
 * Entgelt-Variante der Online-Demo, auf der Anmeldeseite gewählt:
 *  - "angelehnt": tarifangelehnter Betrieb mit eigener Gehaltstabelle (Gruppe 1–6, Stufe 1–4)
 *  - "tarif":     tarifgebundener Betrieb mit Flächentarif (EG 1–17, Stufe 1–3)
 * Nach der Anmeldung lädt die Seite neu – personal.ts erzeugt die
 * Eingruppierungen dann passend zur gespeicherten Wahl.
 */
export type DemoVariante = "angelehnt" | "tarif";

const SCHLUESSEL = "brdms_demo_variante";

export function demoVariante(): DemoVariante {
  try {
    return localStorage.getItem(SCHLUESSEL) === "tarif" ? "tarif" : "angelehnt";
  } catch {
    return "angelehnt";
  }
}

export function demoVarianteSetzen(variante: DemoVariante): void {
  try { localStorage.setItem(SCHLUESSEL, variante); } catch { /* ohne Speicher bleibt es beim Standard */ }
}
