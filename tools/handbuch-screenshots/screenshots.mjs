// Erzeugt die Screenshots fürs Handbuch aus der laufenden Demo-Instanz
// (./demo/demo.sh start). Steuert ein unsichtbares Google Chrome per
// DevTools-Protokoll – keine zusätzlichen npm-Pakete nötig (Node >= 22).
//
// Aufruf:  node tools/handbuch-screenshots/screenshots.mjs
//          NUR=dashboard,fristenkalender node …   (nur einzelne Bilder)
// Ergebnis: tools/handbuch-screenshots/bilder/*.png

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BASIS   = process.env.DEMO_URL ?? "https://localhost:8444";
const BENUTZER = process.env.DEMO_BENUTZER ?? "s.kroeger";
const PASSWORT = process.env.DEMO_PASSWORT ?? "Demo2026!";
const ADMIN    = process.env.DEMO_ADMIN ?? "admin@nordwerk-demo.lokal";
// google-chrome, sonst chromium (z. B. Linux Mint/Ubuntu) – mit CHROME=… überschreibbar
const CHROME  = process.env.CHROME ?? ["google-chrome", "chromium", "chromium-browser"]
  .find(p => process.env.PATH.split(":").some(d => existsSync(path.join(d, p)))) ?? "google-chrome";
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

// Innerstes sichtbares Element mit dem Text anklicken (z. B. eine Karte statt ihres Containers)
const klickInnen = (text, selektor) => `
  (() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selektor)})]
      .filter(e => e.textContent.includes(${JSON.stringify(text)}) && e.offsetParent !== null).pop();
    if (el) el.click();
    return !!el;
  })()`;

// Zum (innersten) Element scrollen, dessen Text so beginnt
const zeigeText = text => `
  (() => {
    const el = [...document.querySelectorAll("h1, h2, h3, p, span, div")]
      .filter(e => e.textContent.trim().startsWith(${JSON.stringify(text)}) && e.offsetParent !== null).pop();
    if (el) el.scrollIntoView({ block: "start" });
    return !!el;
  })()`;

// Auswahlfeld (n-tes <select> der Seite) auf eine Option setzen – so, dass React es mitbekommt
const waehle = (nr, optionText) => `
  (() => {
    const sel = document.querySelectorAll("select")[${nr}];
    const opt = sel && [...sel.options].find(o => o.text.includes(${JSON.stringify(optionText)}));
    if (!opt) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, opt.value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`;

const ersteZeile = `(() => { const tr = document.querySelector("tbody tr"); if (tr) tr.click(); return !!tr; })()`;

// Dokumente: der zuletzt gewählte Ordner wird im Browser gemerkt – immer bei „Alle Dokumente“ beginnen
const alleDokumente = klickInnen("Alle Dokumente", "nav[aria-label=Ordner] div");

const AUFNAHMEN = [
  { datei: "dashboard",        pfad: "/dashboard" },
  { datei: "eingang",          pfad: "/eingang" },
  { datei: "dokumente",        pfad: "/dokumente", js: alleDokumente },
  { datei: "fristenkalender",  pfad: "/fristen" },
  { datei: "sitzungen",        pfad: "/sitzungen" },
  { datei: "sitzung-protokoll", pfad: "/sitzungen", js: klickZeile("Ordentliche Sitzung", "Protokoll final"), warte: 2500 },
  { datei: "sitzung-entwurf",  pfad: "/sitzungen", js: klickText("Protokoll in Bearbeitung", "tr"), warte: 2500 },
  { datei: "sitzung-betriebsversammlung", pfad: "/sitzungen", js: klickZeile("Betriebsversammlung", "Niederschrift final"), warte: 2500 },
  { datei: "beschluesse",      pfad: "/beschluesse" },
  { datei: "gremien",          pfad: "/gremien" },
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
  { datei: "wahlen-ergebnis", pfad: "/wahlen", warte: 1500, js: `
    (() => {
      const b = [...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Erneut übernehmen");
      if (b) b.closest(".border-t").scrollIntoView({ block: "center" });
      return !!b;
    })()` },
  { datei: "wahlen-ergebnis-uebernehmen", pfad: "/wahlen", warte: 3000, js: klickText("Erneut übernehmen", "button") },
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
  { datei: "geschaeftsordnung", pfad: "/geschaeftsordnung" },
  { datei: "schulungen",       pfad: "/schulungen" },
  { datei: "audit",            pfad: "/audit" },
  { datei: "einstellungen-design", pfad: "/einstellungen", js: klickText("Design", "button") },
  { datei: "einstellungen-module", pfad: "/einstellungen", js: klickText("Module", "button"), alsAdmin: true },
  { datei: "benutzer",         pfad: "/einstellungen", js: klickText("Benutzer", "button") },
  // Nur sinnvoll, solange der Vorsitz den Admin auf die Technik beschränkt hat
  // (Einstellungen → Benutzer → „Nur technische Verwaltung“)
  { datei: "admin-ohne-inhalt", pfad: "/einstellungen", js: klickText("Benutzer", "button"), alsAdmin: true },
  // Ergänzungen: Detailansichten, Einstellungs-Reiter, Sonderfunktionen
  { datei: "dokument-vorschau",   pfad: "/dokumente", js: [alleDokumente, ersteZeile], warte: 4000 },
  { datei: "dokument-bearbeiten", pfad: "/dokumente", js: [alleDokumente, ersteZeile, klickText("Bearbeiten", "button"), zeigeText("Kommentare")] },
  // Ordnerbaum: Schriftverkehr öffnen, dann den Unterordner Geschäftsführung aus der Liste
  { datei: "dokumente-ordner",    pfad: "/dokumente", js: [klickInnen("Schriftverkehr", "nav[aria-label=Ordner] div[draggable]"), klickZeile("Geschäftsführung")] },
  { datei: "eingang-aktionen",    pfad: "/eingang", js: `(() => { const b = document.querySelector(".space-y-2 > div > button"); if (b) b.click(); return !!b; })()`, warte: 5000 },
  { datei: "gremium-detail",      pfad: "/gremien", js: klickInnen("Wirtschaftsausschuss", "div.cursor-pointer") },
  { datei: "sitzung-einladung",   pfad: "/sitzungen", js: [klickText("Tagesordnung fixiert", "tr"), zeigeText("Einladung per E-Mail")], warte: 2500 },
  { datei: "themensammlung",      pfad: "/themen", js: klickText("Themen laden", "button"), warte: 2500 },
  { datei: "gesetz-popup",        pfad: "/suche?q=Pausen", warte: 2500, js: `
    (() => {
      const b = [...document.querySelectorAll("button")].find(e => e.textContent.trim().startsWith("BetrVG § 87"));
      if (b) b.click();
      return !!b;
    })()` },
  { datei: "passwort-aendern",    pfad: "/dashboard", js: `(() => { const b = document.querySelector('[title="Passwort ändern"]'); if (b) b.click(); return !!b; })()` },
  { datei: "ueberstunden",        pfad: "/gehaltstabelle" },
  { datei: "sichtschutz",         pfad: "/gehaltstabelle", js: [klickText("Liste", "button"), waehle(0, "IT"), `(() => { window.dispatchEvent(new Event("blur")); return true; })()`] },
  { datei: "mitarbeiter-auswahl", pfad: "/mitarbeiter", js: `(() => { const b = [...document.querySelectorAll("tbody tr td:first-child button")].slice(0, 3); b.forEach(x => x.click()); return b.length > 0; })()` },
  { datei: "einstellungen-fristen",    pfad: "/einstellungen" },
  { datei: "einstellungen-protokoll",  pfad: "/einstellungen", js: klickText("Protokoll-Layout", "button") },
  { datei: "einstellungen-system",     pfad: "/einstellungen", js: klickText("System", "button") },
  { datei: "einstellungen-gefahrenzone", pfad: "/einstellungen", js: [klickText("System", "button"), zeigeText("Gefahrenzone")], alsAdmin: true },
  { datei: "einstellungen-gesetze",    pfad: "/einstellungen", js: klickText("Gesetzestexte", "button"), alsAdmin: true },
  { datei: "einstellungen-amtsuebergabe", pfad: "/einstellungen", js: klickText("Amtsübergabe", "button") },
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
  if (typeof WebSocket === "undefined") {
    throw new Error(`Node ${process.version} hat kein eingebautes WebSocket – Node 22 nötig, z. B.: npx -y node@22 ${path.relative(process.cwd(), new URL(import.meta.url).pathname)}`);
  }
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
      // js: ein Skript oder eine Liste von Schritten (z. B. erst Zeile öffnen, dann Reiter klicken)
      for (const schritt of a.js ? [a.js].flat() : []) {
        const { result } = await auswerten(schritt);
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
