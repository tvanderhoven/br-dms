/**
 * Mini-Backend im Browser für die Online-Demo (VITE_DEMO_MODE=true).
 * Fängt fetch()-Aufrufe an /api/... ab (siehe demo/index.ts) und beantwortet sie
 * aus den Beispieldaten in fixtures.ts – ohne echten Server, ohne Persistenz
 * über einen Seitenreload hinaus. Nicht sicherheitsrelevant: es gibt keinen
 * echten Login, jeder Request wird einfach beantwortet.
 */
import * as F from "./fixtures";
import * as P from "./personal";

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
  nachrichtenGesendet: [],
  kummerkasten: [],
  gremien: [],
  qualifikationen: klon(P.DEMO_QUALIFIKATIONEN),
  schulungen: klon(P.DEMO_SCHULUNGEN),
  mitarbeiter: klon(P.DEMO_MITARBEITER),
  abteilungen: klon(P.DEMO_ABTEILUNGEN),
  gehaltstabelle: klon(P.DEMO_GEHALT),
  zeitmodell: klon(P.DEMO_ZEITMODELL),
  ueberstunden: klon(P.DEMO_UEBERSTUNDEN),
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

// ── Sitzungen ──────────────────────────────────────────────────────────
// Beschlüsse je TOP und Anwesenheit je Sitzung, wie sie die Sitzungsseite einzeln abruft
const topBeschluesse: Record<string, Eintrag[]> = klon(F.DEMO_TOP_BESCHLUESSE);
const anwesenheit: Record<string, Record<string, string>> = klon(F.DEMO_ANWESENHEIT);

const DEMO_HINWEIS = "In der Online-Demo nicht verfügbar – im echten BR-DMS entsteht hier ein PDF bzw. geht eine E-Mail raus.";

function sitzungListItem(s: Eintrag): Eintrag {
  return {
    id: s.id, titel: s.titel, sitzungsdatum: s.sitzungsdatum, ort: s.ort, sitzungstyp: s.sitzungstyp, status: s.status,
    erstelltAm: s.erstelltAm, gremium: s.gremium, erstelltVon: s.erstelltVon, _count: { tops: s.tops.length },
    dokumentAnzahl: new Set(s.tops.flatMap((t: Eintrag) => t.dokumente.map((d: Eintrag) => d.dokument.id))).size,
    versionen: s.versionen.map((v: Eintrag) => ({ versionNummer: v.versionNummer, typ: v.typ })),
  };
}

/** Statuswechsel wie im echten Ablauf, jeweils mit neuer Version */
const UEBERGAENGE: Record<string, { von: string; nach: string; version: string; typ: string }> = {
  fixieren:     { von: "ENTWURF",              nach: "TAGESORDNUNG_FIXIERT", version: "1.1", typ: "TAGESORDNUNG_FIXIERT" },
  protokoll:    { von: "TAGESORDNUNG_FIXIERT", nach: "PROTOKOLL_ENTWURF",    version: "2.0", typ: "PROTOKOLL_ENTWURF" },
  finalisieren: { von: "PROTOKOLL_ENTWURF",    nach: "PROTOKOLL_FINAL",      version: "2.1", typ: "PROTOKOLL_FINAL" },
  abschliessen: { von: "PROTOKOLL_FINAL",      nach: "ABGESCHLOSSEN",        version: "",    typ: "" },
};

function sitzungAnfrage(method: string, id: string | undefined, sub: string | undefined, subId: string | undefined,
                        rest: string[], body: Eintrag): Response | null {
  if (!id) {
    if (method === "GET") return json(db.sitzungen.map(sitzungListItem));
    if (method === "POST") {
      const neu: Eintrag = {
        id: zufallsId("demo-s"), titel: body.titel ?? "Neue Sitzung", sitzungsdatum: body.sitzungsdatum ?? jetzt(),
        ort: body.ort ?? "", sitzungstyp: body.sitzungstyp ?? "ORDENTLICH", status: "ENTWURF", notizen: body.notizen ?? "",
        teilnehmerzahl: null, gremium: null, erstelltVon: { id: F.DEMO_ME.id, name: F.DEMO_ME.name },
        versionen: [{ id: zufallsId("demo-v"), versionNummer: "1.0", typ: "TAGESORDNUNG_ENTWURF", readonly: false, erstelltAm: jetzt() }],
        scans: [], tops: [], erstelltAm: jetzt(), aktualisiertAm: jetzt(),
      };
      db.sitzungen.push(neu);
      return json(neu);
    }
    return null;
  }
  const s = db.sitzungen.find(x => x.id === id);
  if (!s) return json({ fehler: "Sitzung nicht gefunden" }, 404);

  if (!sub) {
    if (method === "GET") return json(s);
    if (method === "PATCH") { Object.assign(s, body, { aktualisiertAm: jetzt() }); return json(s); }
    if (method === "DELETE") { s.status = "ABGESAGT"; return json({ nachricht: "Sitzung abgesagt (Demo)" }); }
  }

  const uebergang = sub ? UEBERGAENGE[sub] : undefined;
  if (uebergang && method === "POST") {
    if (s.status !== uebergang.von) return json({ fehler: "Dieser Schritt passt nicht zum aktuellen Stand der Sitzung." }, 400);
    s.status = uebergang.nach;
    if (uebergang.version) {
      s.versionen.push({ id: zufallsId("demo-v"), versionNummer: uebergang.version, typ: uebergang.typ, readonly: uebergang.typ !== "PROTOKOLL_ENTWURF",
        erstelltAm: jetzt(), ...(uebergang.typ === "PROTOKOLL_FINAL" ? { finalisiertAm: jetzt() } : {}) });
    }
    return json(s);
  }

  // TOPs: anlegen, ändern, löschen, sortieren; darunter Beschlüsse und verknüpfte Dokumente
  if (sub === "tops" || sub === "spontan-top") {
    if (subId === "reihenfolge" && method === "PUT") {
      const ids: string[] = body.topIds ?? [];
      s.tops.sort((a: Eintrag, b: Eintrag) => ids.indexOf(a.id) - ids.indexOf(b.id));
      s.tops.forEach((t: Eintrag, i: number) => { t.nummer = i + 1; });
      return json({ ok: true });
    }
    if (subId && rest[0] === "beschluesse") {
      const liste = (topBeschluesse[subId] ??= []);
      if (method === "POST") {
        const ja = Number(body.jaStimmen ?? 0), nein = Number(body.neinStimmen ?? 0);
        const neu = { id: zufallsId("demo-tb"), topId: subId, reihenfolge: liste.length, enthaltungen: 0, nichtTeilgenommen: 0,
          anwesend: 0, finalisiert: false, erstelltAm: jetzt(), stimmen: [], ...body,
          ergebnis: ja > nein ? "ANGENOMMEN" : nein > ja ? "ABGELEHNT" : "UNENTSCHIEDEN" };
        liste.push(neu);
        return json(neu);
      }
      return nestedCrud(liste, method, rest[1], body, "demo-tb");
    }
    if (subId && rest[0] === "dokumente") {
      const t = s.tops.find((x: Eintrag) => x.id === subId);
      if (t && method === "DELETE") t.dokumente = t.dokumente.filter((d: Eintrag) => d.dokument.id !== rest[1]);
      if (t && method === "POST") {
        const d = db.dokumente.find(x => x.id === body.dokumentId);
        if (d) t.dokumente.push({ id: zufallsId("tv"), hinweis: body.hinweis, dokument: { id: d.id, titel: d.titel, alias: d.alias, kategorie: d.kategorie, dateiname: d.dateiname } });
      }
      return json({ ok: true, nachricht: "OK (Demo)" });
    }
    if (subId && rest[0] === "auszug") return text(DEMO_HINWEIS);
    if (method === "POST" && !subId) {
      const neu = { id: zufallsId(`${s.id}-top`), sitzungId: s.id, nummer: s.tops.length + 1, titel: body.titel ?? "Neuer TOP",
        inhalt: body.inhalt ?? "", inhaltsJson: body.inhaltsJson, ergebnis: "", status: "OFFEN", spontan: sub === "spontan-top",
        vertraulich: !!body.vertraulich, dokumente: [], _count: { kommentare: 0 }, erstelltAm: jetzt(), aktualisiertAm: jetzt() };
      s.tops.push(neu);
      return json(neu);
    }
    if (subId && method === "PATCH") {
      const t = s.tops.find((x: Eintrag) => x.id === subId);
      if (t) Object.assign(t, body, body.topStatus ? { status: body.topStatus } : {}, { aktualisiertAm: jetzt() });
      return json(t ?? { ok: true });
    }
    if (subId && method === "DELETE") {
      s.tops = s.tops.filter((x: Eintrag) => x.id !== subId);
      s.tops.forEach((t: Eintrag, i: number) => { t.nummer = i + 1; });
      return json({ nachricht: "TOP gelöscht (Demo)" });
    }
  }

  // Anwesenheit: Liste aller Benutzer mit ihrem Eintrag für diese Sitzung
  if (sub === "anwesenheit") {
    const stand = (anwesenheit[s.id] ??= {});
    if (method !== "GET") {
      const benutzerId = body.benutzerId ?? subId;
      if (benutzerId && method === "DELETE") delete stand[benutzerId];
      else if (benutzerId && body.status) stand[benutzerId] = body.status;
    }
    return json(db.benutzer.filter(b => b.aktiv).map(b => ({
      benutzer: b,
      anwesenheit: stand[b.id] ? { id: `${s.id}-${b.id}`, status: stand[b.id], vertretungFuer: null, benutzer: { id: b.id, name: b.name, rolle: b.rolle } } : null,
    })));
  }
  if (sub === "ersatz-vorschlag") return json({ vorschlag: null, warnung: null, alternative: null });

  // Einladung: Versand wird nur nachgestellt – es geht keine echte E-Mail raus
  if (sub === "einladung") {
    const geladene = db.benutzer.filter(b => b.aktiv);
    const versand = (s.einladungVersand ??= {} as Record<string, string>);
    const fixiert = s.versionen.find((v: Eintrag) => v.typ === "TAGESORDNUNG_FIXIERT");
    if (fixiert?.einladungVersendetAm && Object.keys(versand).length === 0) {
      geladene.forEach(b => { versand[b.id] = fixiert.einladungVersendetAm; });
    }
    if (method === "POST") {
      const ids: string[] = body.benutzerIds ?? geladene.map(b => b.id);
      ids.forEach(bid => { versand[bid] = jetzt(); });
      if (fixiert && !fixiert.einladungVersendetAm) fixiert.einladungVersendetAm = jetzt();
      return json({ gesendet: ids.length, fehlgeschlagen: 0 });
    }
    return json({
      empfaenger: geladene.map(b => ({
        benutzerId: b.id, name: b.name, rolle: b.rolle, adresse: b.email, ersatzFuer: null,
        letzterVersand: versand[b.id] ? { versendetAm: versand[b.id], erfolgreich: true, fehler: null, adresse: b.email } : null,
      })),
      protokoll: Object.entries(versand).map(([bid, am]) => {
        const b = geladene.find(x => x.id === bid);
        return { id: `${s.id}-ev-${bid}`, name: b?.name ?? "", adresse: b?.email ?? "", rolle: b?.rolle ?? "", vertretungFuer: null,
          mitAnhang: true, erfolgreich: true, fehler: null, versendetAm: am, versendetVon: F.DEMO_ME.name, zusatz: null };
      }),
      letzterZusatz: "", smtpAktiv: true, kannVersenden: s.status === "TAGESORDNUNG_FIXIERT",
    });
  }

  // PDFs, Sitzungspaket, Anwesenheitsliste, Scans: nur Platzhalter
  if (["pdf", "sitzungspaket", "anwesenheitsliste", "unterschriftenseite", "scans"].includes(sub ?? "")) {
    if (method === "GET") return text(DEMO_HINWEIS);
    return json({ ok: true, nachricht: DEMO_HINWEIS });
  }
  // Alles Weitere unterhalb einer Sitzung (z. B. Abstimmungen): leer statt der Sitzung selbst,
  // sonst landet ein Objekt dort, wo die Seite eine Liste erwartet
  if (sub) return method === "GET" ? json([]) : json({ ok: true, nachricht: DEMO_HINWEIS });
  return null;
}

// ── Personal: Eingruppierung, Zeitmodelle, Überstunden, Schulungen ───────
const PERSONAL_HINWEIS = "In der Online-Demo nicht verfügbar – im echten BR-DMS werden hier Dateien importiert.";

function mitarbeiterKurz(id: string): Eintrag | null {
  const m = db.mitarbeiter.find(x => x.id === id);
  if (!m) return null;
  const { id: mid, vorname, nachname, pnr, eintritt, austritt, standort, abteilung, beschaeftigungsart } = m;
  return { id: mid, vorname, nachname, pnr, eintritt, austritt, standort, abteilung, beschaeftigungsart };
}

/** Zeiträume/Einträge je Mitarbeiter: Filter wie im Backend (mitarbeiterId, abteilungId, von, bis) */
function gefiltert(liste: Eintrag[], q: URLSearchParams, datumsfeld: string): Eintrag[] {
  const mid = q.get("mitarbeiterId"), abt = q.get("abteilungId"), von = q.get("von"), bis = q.get("bis");
  return liste.filter(e =>
    (!mid || e.mitarbeiterId === mid) &&
    (!abt || e.mitarbeiter?.abteilung?.id === abt) &&
    (!von || e[datumsfeld] >= von) &&
    (!bis || e[datumsfeld] <= bis));
}

/** Zeitmodell/Überstunden: neuer Zeitraum schließt einen offenen Vorgänger (wie im Backend) */
function zeitraumAnfrage(liste: Eintrag[], method: string, id: string | undefined, q: URLSearchParams, body: Eintrag, prefix: string): Response {
  if (id === "laufen-bald-ab") {
    const grenze = new Date(Date.now() + Number(q.get("tage") ?? 30) * 86400000).toISOString();
    return json(liste.filter(e => e.gueltigBis && e.gueltigBis >= jetzt() && e.gueltigBis <= grenze));
  }
  if (!id && method === "GET") return json(gefiltert(liste, q, "gueltigVon"));
  if (!id && method === "POST") {
    const vorgaenger = liste.find(e => e.mitarbeiterId === body.mitarbeiterId && !e.gueltigBis);
    if (vorgaenger && body.gueltigVon) vorgaenger.gueltigBis = new Date(new Date(body.gueltigVon).getTime() - 86400000).toISOString();
    const neu = { id: zufallsId(prefix), gueltigBis: null, bemerkung: null, sitzungId: null, sitzung: null, ...body,
      mitarbeiter: mitarbeiterKurz(body.mitarbeiterId), erstelltAm: jetzt(), aktualisiertAm: jetzt() };
    liste.push(neu);
    return json(neu);
  }
  return genericCrud(liste, method, id, body, prefix);
}

function qualifikationsMatrix(): Eintrag {
  const neueste = new Map<string, string>();
  for (const t of db.schulungen.filter(s => s.status === "ABSOLVIERT")) {
    for (const tn of t.teilnehmer.filter((x: Eintrag) => x.teilgenommen)) {
      const key = `${tn.mitarbeiterId}|${t.qualifikationId}`;
      if (!neueste.has(key) || t.datum > neueste.get(key)!) neueste.set(key, t.datum);
    }
  }
  const sortiert = [...db.mitarbeiter].sort((a, b) => a.nachname.localeCompare(b.nachname) || a.vorname.localeCompare(b.vorname));
  return {
    qualifikationen: db.qualifikationen,
    zeilen: sortiert.map(m => ({
      mitarbeiter: { id: m.id, vorname: m.vorname, nachname: m.nachname },
      zellen: db.qualifikationen.map(q => {
        const absolviertAm = neueste.get(`${m.id}|${q.id}`) ?? null;
        let gueltigBis: string | null = null;
        let status = "NIE";
        if (absolviertAm) {
          if (q.gueltigkeitsdauerMonate) {
            const d = new Date(absolviertAm); d.setMonth(d.getMonth() + q.gueltigkeitsdauerMonate);
            gueltigBis = d.toISOString();
            status = d.getTime() >= Date.now() ? "GUELTIG" : "ABGELAUFEN";
          } else status = "GUELTIG";
        }
        return { qualifikationId: q.id, absolviertAm, gueltigBis, status };
      }),
    })),
  };
}

function personalAnfrage(method: string, resource: string, id: string | undefined, sub: string | undefined, subId: string | undefined,
                         q: URLSearchParams, body: Eintrag): Response | null {
  if (resource === "mitarbeiter") {
    if (id === "import") return json({ fehler: PERSONAL_HINWEIS }, 400);
    if (id === "standort-batch") {
      const ids: string[] = body.ids ?? [];
      db.mitarbeiter.filter(m => ids.includes(m.id)).forEach(m => { m.standort = body.standort ?? null; });
      return json({ aktualisiert: ids.length });
    }
    if (!id && method === "POST" || id && method === "PATCH") {
      const abt = db.abteilungen.find(a => a.id === body.abteilungId);
      if (abt) body.abteilung = { id: abt.id, name: abt.name };
    }
    return null; // Rest generisch
  }
  if (resource === "gehaltstabelle") {
    if (id === "vorlage") return text("personalnummer;nachname;vorname;gruppe;stufe;gehalt_at;gueltig_ab;bemerkung\n");
    if (id === "import") return json({ fehler: PERSONAL_HINWEIS }, 400);
    if (!id && method === "GET") return json(gefiltert(db.gehaltstabelle, q, "gueltigAb"));
    if (!id && method === "POST") {
      const neu = { id: zufallsId("demo-g"), gruppe: null, stufe: null, gehaltAt: null, bemerkung: null, sitzungId: null, sitzung: null, ...body,
        ...(body.gehaltAt != null ? { gehaltAt: Number(body.gehaltAt).toFixed(2) } : {}),
        mitarbeiter: mitarbeiterKurz(body.mitarbeiterId), erstelltAm: jetzt(), aktualisiertAm: jetzt() };
      db.gehaltstabelle.push(neu);
      return json(neu);
    }
    if (id === "alle" || id === "eintraege") return json({ fehler: "In der Online-Demo nicht verfügbar." }, 400);
    return genericCrud(db.gehaltstabelle, method, id, body, "demo-g");
  }
  if (resource === "zeitmodell") return zeitraumAnfrage(db.zeitmodell, method, id, q, body, "demo-z");
  if (resource === "ueberstunden") return zeitraumAnfrage(db.ueberstunden, method, id, q, body, "demo-ue");
  if (resource === "schulungen") {
    if (id === "matrix") return json(qualifikationsMatrix());
    if (!id && method === "GET") {
      const qid = q.get("qualifikationId"), status = q.get("status"), von = q.get("von"), bis = q.get("bis");
      return json(db.schulungen.filter(s => (!qid || s.qualifikationId === qid) && (!status || s.status === status)
        && (!von || s.datum >= von) && (!bis || s.datum <= bis)).sort((a, b) => a.datum.localeCompare(b.datum)));
    }
    const qualifikation = (qid: string) => db.qualifikationen.find(x => x.id === qid);
    if (!id && method === "POST") {
      const neu: Eintrag = { id: zufallsId("demo-st"), titel: null, ort: null, anbieter: null, kosten: null, status: "GEPLANT", bemerkung: null,
        ...body, qualifikation: qualifikation(body.qualifikationId), erstelltAm: jetzt(), aktualisiertAm: jetzt() };
      neu.teilnehmer = (body.teilnehmerIds ?? []).map((mid: string) => ({ id: zufallsId("tn"), mitarbeiterId: mid, teilgenommen: false,
        mitarbeiter: db.mitarbeiter.find(m => m.id === mid) }));
      delete neu.teilnehmerIds;
      db.schulungen.push(neu);
      return json(neu);
    }
    const t = id ? db.schulungen.find(x => x.id === id) : undefined;
    if (t && sub === "teilnehmer") {
      if (method === "POST") t.teilnehmer.push({ id: zufallsId("tn"), mitarbeiterId: body.mitarbeiterId, teilgenommen: !!body.teilgenommen,
        mitarbeiter: db.mitarbeiter.find(m => m.id === body.mitarbeiterId) });
      if (method === "PATCH") t.teilnehmer.filter((x: Eintrag) => x.mitarbeiterId === subId).forEach((x: Eintrag) => { x.teilgenommen = !!body.teilgenommen; });
      if (method === "DELETE") t.teilnehmer = t.teilnehmer.filter((x: Eintrag) => x.mitarbeiterId !== subId);
      return json(t);
    }
    if (t && (method === "PUT" || method === "PATCH")) {
      Object.assign(t, body, body.qualifikationId ? { qualifikation: qualifikation(body.qualifikationId) } : {}, { aktualisiertAm: jetzt() });
      return json(t);
    }
    return null;
  }
  return null;
}

function parseBody(bodyText: string | undefined): Eintrag {
  if (!bodyText) return {};
  try { return JSON.parse(bodyText); } catch { return {}; }
}

export function handleDemoRequest(method: string, pathname: string, searchParams: URLSearchParams, bodyText?: string): Response {
  const body = parseBody(bodyText);
  const segs = pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  const [resource, id, sub, subId, ...rest] = segs;

  // ── Auth ──────────────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/auth/login") return json({ token: fakeJwt() });
  if (method === "POST" && pathname === "/api/auth/logout") return json({ nachricht: "Abgemeldet" });
  if (method === "GET" && pathname === "/api/auth/me") return json(F.DEMO_ME);

  // ── Einstellungen: feste Konfiguration für die Demo ─────────────────
  if (pathname === "/api/einstellungen/module") {
    return json({
      personalverwaltung: true, betriebsvereinbarungen: true, wissensarchiv: true,
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

  // ── Personal ───────────────────────────────────────────────────────────
  if (["mitarbeiter", "gehaltstabelle", "zeitmodell", "ueberstunden", "schulungen"].includes(resource ?? "")) {
    const antwort = personalAnfrage(method, resource, id, sub, subId, searchParams, body);
    if (antwort) return antwort;
  }

  // ── Sitzungen samt TOPs, Beschlüssen, Anwesenheit und Einladung ───────
  if (resource === "sitzungen") {
    const antwort = sitzungAnfrage(method, id, sub, subId, rest, body);
    if (antwort) return antwort;
  }
  // Kommentare an TOPs: in der Demo leer, Neues wird nur angezeigt, nicht gespeichert
  if (resource === "tops" && sub === "kommentare") {
    if (method === "POST") return json({ id: zufallsId("demo-k"), inhalt: body.inhalt ?? "", inhaltJson: body.inhaltJson, erstelltAm: jetzt(), aktualisiertAm: jetzt(), autor: { id: F.DEMO_ME.id, name: F.DEMO_ME.name, email: F.DEMO_ME.email } });
    return json([]);
  }

  // ── Nachrichten: „gesendet“ ist keine ID, „gelesen“ muss wirklich gespeichert werden ──
  if (resource === "nachrichten") {
    if (method === "GET" && id === "gesendet") return json(db.nachrichtenGesendet);
    if (method === "PATCH" && id && sub === "gelesen") {
      const n = db.nachrichten.find(e => e.id === id);
      if (n) { n.gelesen = true; n.gelesenAm = jetzt(); }
      return json(n ?? { ok: true });
    }
    if (method === "POST" && !id) {
      const absender = { id: F.DEMO_ME.id, name: F.DEMO_ME.name, email: F.DEMO_ME.email };
      const empfaenger = body.alle
        ? db.benutzer.filter(u => u.aktiv && u.id !== F.DEMO_ME.id)
        : db.benutzer.filter(u => u.id === body.empfaengerId);
      const neu = empfaenger.map(u => ({
        id: zufallsId("demo-n"), betreff: body.betreff ?? "", inhalt: body.inhalt ?? "", typ: "NORMAL",
        absender, empfaenger: { id: u.id, name: u.name, email: u.email }, gelesen: false, erstelltAm: jetzt(),
      }));
      db.nachrichtenGesendet.unshift(...neu);
      return json(neu[0] ?? { ok: true });
    }
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
