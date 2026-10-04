// Erzeugt die Screenshots fürs Handbuch aus der laufenden Demo-Instanz
// (./demo/demo.sh start). Steuert ein unsichtbares Google Chrome per
// DevTools-Protokoll – keine zusätzlichen npm-Pakete nötig (Node >= 22).
//
// Aufruf:  node tools/handbuch-screenshots/screenshots.mjs
//          NUR=dashboard,fristenkalender node …   (nur einzelne Bilder)
// Ergebnis: tools/handbuch-screenshots/bilder/*.png

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BASIS   = process.env.DEMO_URL ?? "https://localhost:8444";
const BENUTZER = process.env.DEMO_BENUTZER ?? "s.kroeger";
const PASSWORT = process.env.DEMO_PASSWORT ?? "Demo2026!";
const ADMIN    = process.env.DEMO_ADMIN ?? "admin@nordwerk-demo.lokal";
const CHROME  = process.env.CHROME ?? "google-chrome";
const ZIEL    = path.join(path.dirname(new URL(import.meta.url).pathname), "bilder");
const PORT    = 9333;
const BREITE  = 1440, HOEHE = 900, SKALIERUNG = 2;

// Hilfsskripte, die im Browser laufen
const klickText = (text, selektor = "button, a, tr, div[role=button], li") => `
  (() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selektor)})]
      .find(e => e.textContent.trim().includes(${JSON.stringify(text)}) && e.offsetParent !== null);
    if (el) el.click();
    return !!el;
  })()`;

// Tabellenzeile anklicken, die alle Texte enthält (z. B. Sitzungsart + Status)
const klickZeile = (...texte) => `
  (() => {
    const tr = [...document.querySelectorAll("tr")]
      .find(e => ${JSON.stringify(texte)}.every(t => e.textContent.includes(t)));
    if (tr) tr.click();
    return !!tr;
  })()`;

const AUFNAHMEN = [
  { datei: "dashboard",        pfad: "/dashboard" },
  { datei: "eingang",          pfad: "/eingang" },
  { datei: "dokumente",        pfad: "/dokumente" },
  { datei: "fristenkalender",  pfad: "/fristen" },
  { datei: "sitzungen",        pfad: "/sitzungen" },
  { datei: "sitzung-protokoll", pfad: "/sitzungen", js: klickZeile("Ordentliche Sitzung", "Protokoll final"), warte: 2500 },
  { datei: "sitzung-entwurf",  pfad: "/sitzungen", js: klickText("Protokoll in Bearbeitung", "tr"), warte: 2500 },
  { datei: "sitzung-betriebsversammlung", pfad: "/sitzungen", js: klickZeile("Betriebsversammlung", "Niederschrift final"), warte: 2500 },
  { datei: "beschluesse",      pfad: "/beschluesse" },
  { datei: "vorlagen",         pfad: "/vorlagen" },
  { datei: "aufgaben",         pfad: "/aufgaben?ansicht=board" },
  { datei: "aufgaben-liste",   pfad: "/aufgaben?ansicht=liste" },
  { datei: "aufgaben-zeitplan", pfad: "/aufgaben?ansicht=zeitplan" },
  { datei: "themen-backlog",   pfad: "/themen-backlog" },
  { datei: "wahlen",           pfad: "/wahlen" },
  { datei: "wahlen-waehlerliste", pfad: "/wahlen", warte: 2500, js: `
    (() => {
      const b = [...document.querySelectorAll("button")].find(e => e.textContent.includes("Wählerliste & Gremiumsgröße"));
      if (!b) return false;
      b.click();
      setTimeout(() => b.scrollIntoView({ block: "start" }), 1500);
      return true;
    })()` },
  { datei: "posteingang",      pfad: "/posteingang" },
  { datei: "kummerkasten-verwaltung", pfad: "/kummerkasten-verwaltung" },
  { datei: "wissen",           pfad: "/wissen" },
  { datei: "ressourcen",       pfad: "/ressourcen" },
  { datei: "suche",            pfad: "/suche?q=Schicht" },
  { datei: "gehaltstabelle-liste",     pfad: "/gehaltstabelle", js: klickText("Liste", "button") },
  { datei: "gehaltstabelle-statistik", pfad: "/gehaltstabelle", js: klickText("Statistik", "button") },
  { datei: "gehaltstabelle-zeitmodell", pfad: "/gehaltstabelle", js: klickText("Zeitmodell", "button") },
  { datei: "mitarbeiter",      pfad: "/mitarbeiter" },
  { datei: "betriebsvereinbarungen", pfad: "/betriebsvereinbarungen" },
  { datei: "schulungen",       pfad: "/schulungen" },
  { datei: "audit",            pfad: "/audit" },
  { datei: "einstellungen-design", pfad: "/einstellungen", js: klickText("Design", "button") },
  { datei: "einstellungen-module", pfad: "/einstellungen", js: klickText("Module", "button"), alsAdmin: true },
  { datei: "benutzer",         pfad: "/einstellungen", js: klickText("Benutzer", "button") },
  { datei: "kummerkasten-oeffentlich", pfad: "/kummerkasten", ohneLogin: true },
  { datei: "login",            pfad: "/login", ohneLogin: true },
];

const pause = ms => new Promise(r => setTimeout(r, ms));

async function token(benutzer = BENUTZER) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // selbstsigniertes Demo-Zertifikat
  const res = await fetch(`${BASIS}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: benutzer, passwort: PASSWORT }),
  });
  if (!res.ok) throw new Error(`Login fehlgeschlagen (${res.status}) – läuft die Demo?`);
  return (await res.json()).token;
}

async function main() {
  const jwt = await token();
  const adminJwt = await token(ADMIN);
  await fs.mkdir(ZIEL, { recursive: true });
  const profil = await fs.mkdtemp(path.join(os.tmpdir(), "brdms-shots-"));

  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`,
    "--ignore-certificate-errors", "--no-first-run", "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });

  try {
    let ws;
    for (let i = 0; i < 50 && !ws; i++) {
      await pause(200);
      try {
        const ziele = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
        const seite = ziele.find(z => z.type === "page");
        if (seite) ws = new WebSocket(seite.webSocketDebuggerUrl);
      } catch { /* Chrome startet noch */ }
    }
    if (!ws) throw new Error("Chrome nicht erreichbar");
    await new Promise(r => ws.addEventListener("open", r, { once: true }));

    let id = 0;
    const offen = new Map();
    ws.addEventListener("message", e => {
      const m = JSON.parse(e.data);
      if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); }
    });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => {
      const nr = ++id;
      offen.set(nr, m => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: nr, method, params }));
    });
    const auswerten = expr => cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });

    await cdp("Page.enable");
    await cdp("Emulation.setDeviceMetricsOverride", { width: BREITE, height: HOEHE, deviceScaleFactor: SKALIERUNG, mobile: false });

    // Einmal die Origin laden, damit localStorage beschreibbar ist
    await cdp("Page.navigate", { url: `${BASIS}/login` });
    await pause(1500);

    // NUR=dashboard,fristenkalender nimmt nur einzelne Bilder neu auf
    const nur = process.env.NUR?.split(",").map(x => x.trim());
    for (const a of AUFNAHMEN.filter(x => !nur || nur.includes(x.datei))) {
      await auswerten(a.ohneLogin
        ? `localStorage.removeItem("brdms_token")`
        : `localStorage.setItem("brdms_token", ${JSON.stringify(a.alsAdmin ? adminJwt : jwt)})`);
      await cdp("Page.navigate", { url: BASIS + a.pfad });
      await pause(2200);
      if (a.js) {
        const { result } = await auswerten(a.js);
        if (result.value === false) console.warn(`  ! ${a.datei}: Klickziel nicht gefunden`);
        await pause(a.warte ?? 1500);
      }
      const { data } = await cdp("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(path.join(ZIEL, `${a.datei}.png`), Buffer.from(data, "base64"));
      console.log(`  ✔ ${a.datei}.png`);
    }
    ws.close();
  } finally {
    chrome.kill();
    await fs.rm(profil, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
