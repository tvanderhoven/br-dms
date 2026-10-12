/**
 * Mini-Backend im Browser für die Online-Demo (VITE_DEMO_MODE=true).
 * Fängt fetch()-Aufrufe an /api/... ab (siehe demo/index.ts) und beantwortet sie
 * aus den Beispieldaten in fixtures.ts – ohne echten Server, ohne Persistenz
 * über einen Seitenreload hinaus. Nicht sicherheitsrelevant: es gibt keinen
 * echten Login, jeder Request wird einfach beantwortet.
 */
import * as F from "./fixtures";

type Eintrag = Record<string, any>;

function klon<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function zufallsId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// Jede Session startet frisch aus den Fixtures – Änderungen während der Demo
// (Aufgabe erledigt, Eintrag angelegt, …) bleiben nur bis zum nächsten Reload erhalten.
const db: Record<string, Eintrag[]> = {
  benutzer: klon(F.DEMO_BENUTZER),
  dokumente: klon(F.DEMO_DOKUMENTE),
  sitzungen: klon(F.DEMO_SITZUNGEN),
  aufgaben: klon(F.DEMO_AUFGABEN),
  fristen: klon(F.DEMO_FRISTEN),
  wissen: klon(F.DEMO_WISSEN),
  ressourcen: klon(F.DEMO_RESSOURCEN),
  vorlagen: klon(F.DEMO_VORLAGEN),
  betriebsvereinbarungen: klon(F.DEMO_BETRIEBSVEREINBARUNGEN),
  geschaeftsordnung: klon(F.DEMO_GESCHAEFTSORDNUNG),
  beschluesse: klon(F.DEMO_BESCHLUESSE),
  themen: klon(F.DEMO_THEMEN),
  nachrichten: klon(F.DEMO_NACHRICHTEN),
  kummerkasten: [],
  gremien: [],
  qualifikationen: [],
  schulungen: [],
  mitarbeiter: [],
  abteilungen: [],
  gehaltstabelle: [],
  wahlen: [],
  fremdprotokolle: [],
  ordner: [],
};

function jetzt(): string {
  return new Date().toISOString();
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function text(inhalt: string): Response {
  return new Response(inhalt, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function base64(obj: object): string {
  return btoa(JSON.stringify(obj));
}

/** Nur lokal lesbar (App.tsx liest exp aus dem Payload) – keine echte Signatur, keine Serverprüfung. */
export function fakeJwt(): string {
  const header = base64({ alg: "none", typ: "JWT" });
  const payload = base64({ sub: F.DEMO_ME.id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 });
  return `${header}.${payload}.demo-signatur`;
}

function sucheAusfuehren(qRoh: string) {
  const q = qRoh.trim().toLowerCase();
  const passt = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q);
  if (q.length < 2) return { dokumente: [], sitzungen: [] };
  return {
    dokumente: db.dokumente
      .filter(d => passt(d.titel) || passt(d.alias))
      .map(d => ({ id: d.id, titel: d.titel, alias: d.alias, kategorie: d.kategorie, status: d.status, tags: d.tags, dateiname: d.dateiname, erstelltAm: d.erstelltAm })),
    sitzungen: db.sitzungen
      .filter(s => passt(s.titel))
      .map(s => ({ id: s.id, titel: s.titel, sitzungsdatum: s.sitzungsdatum, status: s.status })),
    wissen: db.wissen.filter(w => passt(w.titel)).map(w => ({ id: w.id, titel: w.titel, kategorien: w.kategorien, erstelltAm: w.erstelltAm })),
    ressourcen: db.ressourcen.filter(r => passt(r.titel)).map(r => ({ id: r.id, titel: r.titel, url: r.url, kategorie: r.kategorie, erstelltAm: r.erstelltAm })),
    betriebsvereinbarungen: db.betriebsvereinbarungen.filter(b => passt(b.titel)).map(b => ({ id: b.id, titel: b.titel, status: b.status, abschlussdatum: b.abschlussdatum })),
  };
}

// Manche Ressourcen brauchen bei der Neuanlage ein leeres Unterarray, sonst würde
// die Seite direkt danach auf einem undefined-Feld crashen (z. B. vorlage.tops.map).
const NEUANLAGE_DEFAULTS: Record<string, Eintrag> = {
  vorlagen: { tops: [] },
};

/** Generische Liste/Erstellen/Ändern/Löschen für eine Top-Level-Ressource wie /api/aufgaben(/:id). */
function genericCrud(collection: Eintrag[], method: string, id: string | undefined, body: Eintrag, resourcePrefix: string): Response {
  if (!id) {
    if (method === "POST") {
      const neu: Eintrag = {
        id: zufallsId(resourcePrefix),
        ...(NEUANLAGE_DEFAULTS[resourcePrefix] ?? {}),
        ...body,
        erstelltAm: jetzt(),
        aktualisiertAm: jetzt(),
      };
      collection.push(neu);
      return json(neu);
    }
    if (method === "GET") return json(collection);
    return json({ ok: true });
  }
  const idx = collection.findIndex(e => e.id === id);
  if (method === "GET") return idx >= 0 ? json(collection[idx]) : json(null, 404);
  if (method === "PATCH" || method === "PUT") {
    if (idx < 0) return json({ ok: true });
    collection[idx] = { ...collection[idx], ...body, aktualisiertAm: jetzt() };
    return json(collection[idx]);
  }
  if (method === "DELETE") {
    if (idx >= 0) collection.splice(idx, 1);
    return json({ ok: true, nachricht: "Gelöscht (Demo)" });
  }
  return json({ ok: true });
}

/** Verschachtelte Unterliste, z. B. die TOPs einer Vorlage unter /api/vorlagen/:id/tops(/:topId). */
function nestedCrud(liste: Eintrag[], method: string, subId: string | undefined, body: Eintrag, prefix: string): Response {
  if (!subId) {
    if (method === "POST") {
      const neu: Eintrag = { id: zufallsId(prefix), reihenfolge: liste.length, ...body };
      liste.push(neu);
      return json(neu);
    }
    return json(liste);
  }
  const idx = liste.findIndex(e => e.id === subId);
  if (method === "PATCH") {
    if (idx >= 0) liste[idx] = { ...liste[idx], ...body };
    return json(idx >= 0 ? liste[idx] : { ok: true });
  }
  if (method === "DELETE") {
    if (idx >= 0) liste.splice(idx, 1);
    return json({ ok: true });
  }
  return json({ ok: true });
}

function parseBody(bodyText: string | undefined): Eintrag {
  if (!bodyText) return {};
  try { return JSON.parse(bodyText); } catch { return {}; }
}

export function handleDemoRequest(method: string, pathname: string, searchParams: URLSearchParams, bodyText?: string): Response {
  const body = parseBody(bodyText);
  const segs = pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  const [resource, id, sub, subId] = segs;

  // ── Auth ──────────────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/auth/login") return json({ token: fakeJwt() });
  if (method === "POST" && pathname === "/api/auth/logout") return json({ nachricht: "Abgemeldet" });
  if (method === "GET" && pathname === "/api/auth/me") return json(F.DEMO_ME);

  // ── Einstellungen: feste Konfiguration für die Demo ─────────────────
  if (pathname === "/api/einstellungen/module") {
    return json({
      personalverwaltung: false, betriebsvereinbarungen: true, wissensarchiv: true,
      ressourcen: true, themensammlung: true, gremien: false, kosten: false,
    });
  }
  if (pathname === "/api/einstellungen/sicherheit") return json({ inaktivitaetMinuten: 0 });
  if (pathname === "/api/einstellungen/wahlquote") return json({ minderheitengeschlecht: null, mindestsitzeMinderheit: 0 });
  if (pathname === "/api/einstellungen/update") return json({ installiert: null, hinweis: null });

  // ── Schnellsuche im Kopfbalken ───────────────────────────────────────
  if (method === "GET" && pathname === "/api/suche") return json(sucheAusfuehren(searchParams.get("q") ?? ""));

  // ── Audit-Log: leer, nur damit die Seite nicht crasht ───────────────
  if (pathname === "/api/audit") return json({ eintraege: [], gesamt: 0, seite: 1, seiten: 0 });

  // ── Dokumente: Sonderpfade vor der generischen CRUD-Logik ───────────
  if (method === "GET" && pathname === "/api/dokumente/inbox") {
    return json(db.dokumente.filter(d => !d.inboxGelesen));
  }
  if (resource === "dokumente" && (sub === "download" || sub === "vorschau")) {
    return text("Demo-Modus: Dies ist keine echte Datei, sondern nur ein Platzhalter.");
  }

  // ── Vorlagen: TOPs als Unterliste ────────────────────────────────────
  if (resource === "vorlagen" && id && sub === "tops") {
    const vorlage = db.vorlagen.find(v => v.id === id);
    if (vorlage) return nestedCrud(vorlage.tops, method, subId, body, "vt");
  }

  // ── Generische Ressourcen-CRUD für alles andere Bekannte ────────────
  if (resource && db[resource] !== undefined) {
    return genericCrud(db[resource], method, id, body, resource);
  }

  // ── Unbekannter Pfad: nichts kaputt machen statt einen Fehler zu werfen ──
  if (method === "GET") return json([]);
  return json({ ok: true });
}
