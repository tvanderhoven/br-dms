/**
 * Beispieldaten für die öffentliche Online-Demo (VITE_DEMO_MODE=true).
 * Komplett fiktive Firma/Personen – nichts davon ist echt oder stammt aus echten BR-DMS-Daten.
 * Siehe demo/mockBackend.ts für die Engine, die diese Daten statt eines echten Backends ausliefert.
 */

const TAG_MS = 86_400_000;

/** ISO-Datum n Tage ab heute (negativ = Vergangenheit) */
function tag(n: number): string {
  return new Date(Date.now() + n * TAG_MS).toISOString();
}

export const DEMO_FIRMA = "Beispiel Industrietechnik GmbH";

// ── Benutzer (Betriebsratsgremium) ─────────────────────────────────
export const DEMO_BENUTZER = [
  { id: "demo-u1", name: "Anna Beispiel",     email: "anna.beispiel@demo.invalid",     rolle: "VORSITZ",        aktiv: true, geschlecht: "WEIBLICH",  zweiFaktorAktiv: false },
  { id: "demo-u2", name: "Jonas Mustermann",  email: "jonas.mustermann@demo.invalid",  rolle: "STELLVERTRETER", aktiv: true, geschlecht: "MAENNLICH", zweiFaktorAktiv: false },
  { id: "demo-u3", name: "Lea Fiktiv",        email: "lea.fiktiv@demo.invalid",        rolle: "MITGLIED",       aktiv: true, geschlecht: "WEIBLICH",  zweiFaktorAktiv: false },
  { id: "demo-u4", name: "Tom Platzhalter",   email: "tom.platzhalter@demo.invalid",   rolle: "MITGLIED",       aktiv: true, geschlecht: "MAENNLICH", zweiFaktorAktiv: false },
  { id: "demo-u5", name: "Nina Beispielhaft", email: "nina.beispielhaft@demo.invalid", rolle: "ERSATZMITGLIED", aktiv: true, geschlecht: "WEIBLICH",  zweiFaktorAktiv: false },
];

export const DEMO_ME = {
  ...DEMO_BENUTZER[0],
  ohneInhaltszugriff: false,
  istVertretungFuer: undefined as string | undefined,
};

// ── Dokumente ───────────────────────────────────────────────────────
export const DEMO_DOKUMENTE = [
  {
    id: "demo-d1", titel: "BV Gleitzeit 2025", alias: "BV Gleitzeit 2025", tags: ["gleitzeit", "arbeitszeit"],
    kategorie: "BETRIEBSVEREINBARUNG", status: "AKTIV", dateiname: "bv-gleitzeit-2025.pdf",
    dateigroesse: 184_320, mimeTyp: "application/pdf", vertraulich: false,
    inboxGelesen: true, erstelltAm: tag(-120),
  },
  {
    id: "demo-d2", titel: "Anhörung Neueinstellung Lager", alias: "§ 99 Neueinstellung Lager", tags: ["§99"],
    kategorie: "ANHOERUNG_99", status: "AKTIV", dateiname: "anhoerung-lager.pdf",
    dateigroesse: 92_160, mimeTyp: "application/pdf", vertraulich: true,
    inboxGelesen: true, erstelltAm: tag(-9),
  },
  {
    id: "demo-d3", titel: "Protokoll Sitzung Oktober", alias: "Protokoll Oktober", tags: ["protokoll"],
    kategorie: "PROTOKOLL", status: "AKTIV", dateiname: "protokoll-oktober.pdf",
    dateigroesse: 143_000, mimeTyp: "application/pdf", vertraulich: false,
    inboxGelesen: true, erstelltAm: tag(-30),
  },
  {
    id: "demo-d4", titel: "Infoschreiben Arbeitgeber – Kurzarbeit", alias: "Info AG Kurzarbeit", tags: [],
    kategorie: "ARBEITGEBER_INFO", status: "AKTIV", dateiname: "info-kurzarbeit.pdf",
    dateigroesse: 51_200, mimeTyp: "application/pdf", vertraulich: false,
    inboxGelesen: false, deleteAt: tag(18), erstelltAm: tag(-200),
  },
];

// ── Sitzungen (nur zur Anzeige im Dashboard/Themen-Backlog – die
//    Sitzungsverwaltung selbst ist in der Demo deaktiviert) ───────────
// Versionen wie im echten Ablauf: 1.0 Entwurf → 1.1 fixiert → 2.0 Protokoll → 2.1 final
function version(nr: string, typ: string, tageZurueck: number, extra: Record<string, unknown> = {}) {
  return { id: `demo-v-${nr}-${typ}`, versionNummer: nr, typ, readonly: typ !== "PROTOKOLL_ENTWURF" && typ !== "TAGESORDNUNG_ENTWURF", erstelltAm: tag(tageZurueck), ...extra };
}
function top(sitzungId: string, nummer: number, titel: string, felder: Record<string, unknown> = {}) {
  return {
    id: `${sitzungId}-top${nummer}`, sitzungId, nummer, titel, inhalt: "", ergebnis: "",
    status: "OFFEN", spontan: false, vertraulich: false, dokumente: [], _count: { kommentare: 0 },
    erstelltAm: tag(-20), aktualisiertAm: tag(-3), ...felder,
  };
}
const dokVerweis = (id: string, titel: string, kategorie: string, dateiname: string, aktenzeichen?: string) =>
  ({ id: `tv-${id}`, dokument: { id, titel, kategorie, dateiname, aktenzeichen } });

export const DEMO_SITZUNGEN = [
  {
    id: "demo-s1",
    titel: "Betriebsratssitzung – Personelles und Befragung",
    sitzungsdatum: tag(6),
    ort: "Besprechungsraum 2",
    sitzungstyp: "ORDENTLICH",
    status: "TAGESORDNUNG_FIXIERT",
    notizen: "",
    teilnehmerzahl: null,
    gremium: null,
    erstelltVon: { id: "demo-u1", name: "Anna Beispiel" },
    versionen: [version("1.0", "TAGESORDNUNG_ENTWURF", -14), version("1.1", "TAGESORDNUNG_FIXIERT", -3, { einladungVersendetAm: tag(-3) })],
    scans: [],
    dokumentAnzahl: 1,
    tops: [
      top("demo-s1", 1, "Begrüßung, Beschlussfähigkeit, Tagesordnung", { inhalt: "Feststellung der ordnungsgemäßen Ladung und der Beschlussfähigkeit." }),
      top("demo-s1", 2, "Genehmigung des Protokolls der letzten Sitzung", { inhalt: "Das Protokoll wurde mit der Einladung versandt." }),
      top("demo-s1", 3, "Neueinstellung Lager (§ 99 BetrVG)", {
        vertraulich: true, inhalt: "Anhörung zur Einstellung einer Fachkraft für Lagerlogistik, befristet auf zwölf Monate.",
        dokumente: [dokVerweis("demo-d2", "Anhörung Neueinstellung Lager", "ANHOERUNG_99", "anhoerung-lager.pdf")],
      }),
      top("demo-s1", 4, "Mitarbeiterbefragung – Fragebogen", { inhalt: "Abstimmung des Fragebogens mit der Personalabteilung." }),
      top("demo-s1", 5, "Verschiedenes"),
    ],
    erstelltAm: tag(-14),
    aktualisiertAm: tag(-3),
  },
  {
    id: "demo-s2",
    titel: "Betriebsratssitzung – Gleitzeit und Mehrarbeit",
    sitzungsdatum: tag(-21),
    ort: "Besprechungsraum 2",
    sitzungstyp: "ORDENTLICH",
    status: "PROTOKOLL_FINAL",
    notizen: "",
    teilnehmerzahl: null,
    gremium: null,
    erstelltVon: { id: "demo-u1", name: "Anna Beispiel" },
    versionen: [
      version("1.0", "TAGESORDNUNG_ENTWURF", -35), version("1.1", "TAGESORDNUNG_FIXIERT", -28, { einladungVersendetAm: tag(-28) }),
      version("2.0", "PROTOKOLL_ENTWURF", -21), version("2.1", "PROTOKOLL_FINAL", -14, { finalisiertAm: tag(-14) }),
    ],
    scans: [],
    dokumentAnzahl: 2,
    tops: [
      top("demo-s2", 1, "Begrüßung, Beschlussfähigkeit, Tagesordnung", {
        status: "ZUR_KENNTNIS", ergebnis: "Die Sitzung wurde ordnungsgemäß geladen. Vier von vier ordentlichen Mitgliedern anwesend, der Betriebsrat ist beschlussfähig.",
      }),
      top("demo-s2", 2, "Betriebsvereinbarung Gleitzeit 2025 – Kündigung durch den Arbeitgeber", {
        status: "BESCHLOSSEN",
        inhalt: "Der Arbeitgeber hat die BV Gleitzeit zum 31.12. gekündigt. Bis zu einer Neuregelung gilt sie nach.",
        ergebnis: "Der Betriebsrat nimmt Verhandlungen über eine neue Gleitzeitregelung auf. Verhandlungskommission: Anna Beispiel, Jonas Mustermann.",
        dokumente: [dokVerweis("demo-d1", "BV Gleitzeit 2025", "BETRIEBSVEREINBARUNG", "bv-gleitzeit-2025.pdf")],
      }),
      top("demo-s2", 3, "Mehrarbeit Lager KW 44–46 (§ 87 Abs. 1 Nr. 3 BetrVG)", {
        status: "BESCHLOSSEN",
        inhalt: "Antrag des Arbeitgebers auf Mehrarbeit von bis zu sechs Stunden je Woche für das Lagerteam.",
        ergebnis: "Zustimmung unter der Bedingung, dass die Mehrarbeit freiwillig ist und in Freizeit ausgeglichen werden kann.",
      }),
      top("demo-s2", 4, "Verschiedenes", { status: "ZUR_KENNTNIS", ergebnis: "Hinweis aus dem Kummerkasten zur Beleuchtung im Lager an die Haustechnik weitergegeben." }),
    ],
    erstelltAm: tag(-35),
    aktualisiertAm: tag(-14),
  },
  {
    id: "demo-s3",
    titel: "Betriebsratssitzung – Jahresplanung",
    sitzungsdatum: tag(34),
    ort: "Besprechungsraum 2",
    sitzungstyp: "ORDENTLICH",
    status: "ENTWURF",
    notizen: "Jahresplanung 2027 vorbereiten.",
    teilnehmerzahl: null,
    gremium: null,
    erstelltVon: { id: "demo-u1", name: "Anna Beispiel" },
    versionen: [version("1.0", "TAGESORDNUNG_ENTWURF", -2)],
    scans: [],
    dokumentAnzahl: 0,
    tops: [
      top("demo-s3", 1, "Begrüßung, Beschlussfähigkeit, Tagesordnung"),
      top("demo-s3", 2, "Seminarplanung 2027 (§ 37 Abs. 6 BetrVG)"),
      top("demo-s3", 3, "Verschiedenes"),
    ],
    erstelltAm: tag(-2),
    aktualisiertAm: tag(-2),
  },
];

// Beschlüsse je TOP (Sitzung Oktober) – Grundlage der Ansicht „Beschlüsse“ am TOP
export const DEMO_TOP_BESCHLUESSE: Record<string, Record<string, unknown>[]> = {
  "demo-s2-top2": [{
    id: "demo-tb1", topId: "demo-s2-top2", reihenfolge: 0,
    antragstext: "Der Betriebsrat nimmt Verhandlungen über eine neue Gleitzeitregelung auf und benennt Anna Beispiel und Jonas Mustermann als Verhandlungskommission.",
    rechtsgrundlage: "§ 87 BetrVG – Mitbestimmung", jaStimmen: 4, neinStimmen: 0, enthaltungen: 0, nichtTeilgenommen: 0, anwesend: 4,
    ergebnis: "ANGENOMMEN", finalisiert: true, finalisiertAm: tag(-14), erstelltAm: tag(-21), stimmen: [],
  }],
  "demo-s2-top3": [{
    id: "demo-tb2", topId: "demo-s2-top3", reihenfolge: 0,
    antragstext: "Der Betriebsrat stimmt der Mehrarbeit im Lager in den KW 44–46 zu, sofern sie freiwillig ist und in Freizeit ausgeglichen werden kann.",
    rechtsgrundlage: "§ 87 BetrVG – Mitbestimmung", jaStimmen: 3, neinStimmen: 0, enthaltungen: 1, nichtTeilgenommen: 0, anwesend: 4,
    ergebnis: "ANGENOMMEN", finalisiert: true, finalisiertAm: tag(-14), erstelltAm: tag(-21), stimmen: [],
  }],
};

// Anwesenheit (Sitzung Oktober): Status je Benutzer-ID, alle anderen ohne Eintrag
export const DEMO_ANWESENHEIT: Record<string, Record<string, string>> = {
  "demo-s2": { "demo-u1": "ANWESEND", "demo-u2": "ANWESEND", "demo-u3": "ANWESEND", "demo-u4": "ANWESEND", "demo-u5": "ABWESEND_ENTSCHULDIGT" },
};

// ── Aufgaben (inkl. Themen-Backlog-Einträge über kanbanStatus) ──────
export const DEMO_AUFGABEN = [
  {
    id: "demo-a1", titel: "Fragebogen Mitarbeiterbefragung abstimmen", typ: "AUFGABE", prioritaet: "HOCH",
    faelligAm: tag(2), erledigt: false, sichtbarkeit: "OEFFENTLICH",
    erstelltVon: { id: "demo-u1", name: "Anna Beispiel", email: "anna.beispiel@demo.invalid" },
    zugewiesenAn: { id: "demo-u1", name: "Anna Beispiel", email: "anna.beispiel@demo.invalid" },
    kanbanStatus: null, erstelltAm: tag(-5), aktualisiertAm: tag(-5),
  },
  {
    id: "demo-a2", titel: "Rückmeldung zur Gefährdungsbeurteilung Lager einholen", typ: "AUFGABE", prioritaet: "MITTEL",
    faelligAm: tag(9), erledigt: false, sichtbarkeit: "OEFFENTLICH",
    erstelltVon: { id: "demo-u2", name: "Jonas Mustermann", email: "jonas.mustermann@demo.invalid" },
    zugewiesenAn: { id: "demo-u3", name: "Lea Fiktiv", email: "lea.fiktiv@demo.invalid" },
    kanbanStatus: null, erstelltAm: tag(-4), aktualisiertAm: tag(-4),
  },
  {
    id: "demo-a3", titel: "Unterlagen Einigungsstelle Arbeitszeit sichten", typ: "AUFGABE", prioritaet: "NIEDRIG",
    erledigt: false, sichtbarkeit: "OEFFENTLICH",
    erstelltVon: { id: "demo-u1", name: "Anna Beispiel", email: "anna.beispiel@demo.invalid" },
    zugewiesenAn: { id: "demo-u4", name: "Tom Platzhalter", email: "tom.platzhalter@demo.invalid" },
    kanbanStatus: null, erstelltAm: tag(-1), aktualisiertAm: tag(-1),
  },
  {
    id: "demo-a4", titel: "Idee: Jobrad-Leasing ansprechen", typ: "AUFGABE", prioritaet: "NIEDRIG",
    erledigt: false, sichtbarkeit: "OEFFENTLICH",
    erstelltVon: { id: "demo-u3", name: "Lea Fiktiv", email: "lea.fiktiv@demo.invalid" },
    kanbanStatus: "BACKLOG", erstelltAm: tag(-20), aktualisiertAm: tag(-20),
  },
  {
    id: "demo-a5", titel: "Vorschlag Pausenraum-Umgestaltung", typ: "AUFGABE", prioritaet: "MITTEL",
    erledigt: false, sichtbarkeit: "OEFFENTLICH",
    erstelltVon: { id: "demo-u4", name: "Tom Platzhalter", email: "tom.platzhalter@demo.invalid" },
    kanbanStatus: "IN_BEARBEITUNG", erstelltAm: tag(-15), aktualisiertAm: tag(-2),
  },
];

// ── Fristenkalender ──────────────────────────────────────────────────
export const DEMO_FRISTEN = [
  {
    id: "demo-f1", typ: "ANHOERUNG_99_WOCHE", status: "OFFEN", faelligAm: tag(-1),
    bezeichnung: "Stellungnahme § 99 – Neueinstellung Lager", erstelltAm: tag(-6),
    dokument: { id: "demo-d2", titel: "Anhörung Neueinstellung Lager", alias: "§ 99 Neueinstellung Lager", kategorie: "ANHOERUNG_99" },
  },
  {
    id: "demo-f2", typ: "BENUTZERDEFINIERT", status: "OFFEN", faelligAm: tag(1),
    bezeichnung: "Rückmeldung Gefährdungsbeurteilung Lager", erstelltAm: tag(-4), dokument: null,
  },
  {
    id: "demo-f3", typ: "BETRIEBSVERSAMMLUNG_43", status: "OFFEN", faelligAm: tag(5),
    bezeichnung: "Nächste Betriebsversammlung (Quartal)", erstelltAm: tag(-30), dokument: null,
  },
  {
    id: "demo-f4", typ: "BENUTZERDEFINIERT", status: "OFFEN", faelligAm: tag(12),
    bezeichnung: "Angebot Einigungsstelle einholen", erstelltAm: tag(-2), dokument: null,
  },
  // Fristsache wie im Echtbetrieb: Zugang noch nicht bestätigt, Ende nach § 193 BGB verschoben
  // (im Fristenkalender „vorläufig“ und „verschoben wegen …“, siehe lib/zugang.ts im Backend)
  {
    id: "demo-f5", typ: "ANHOERUNG_102_AUSSERORDENTLICH", status: "OFFEN", faelligAm: tag(3),
    erstelltAm: tag(0), vorlaeufig: true,
    verschoben: [{ tag: "", grund: "Samstag" }, { tag: "", grund: "Sonntag" }],
    dokument: { id: "demo-d6", titel: "Anhörung außerordentliche Kündigung", alias: "§ 102 fristlose Kündigung", kategorie: "ANHOERUNG_102" },
  },
];

// ── Wissensarchiv ────────────────────────────────────────────────────
export const DEMO_WISSEN = [
  {
    id: "demo-w1", titel: "Vorgehen bei Anhörung nach § 99 BetrVG", inhalt:
      "Kurzer Ablauf: Eingang dokumentieren, Frist von einer Woche notieren, im Zweifel Zustimmung " +
      "schriftlich verweigern statt Frist verstreichen zu lassen.", herkunft: "MANUELL",
    kategorien: ["§99", "Ablauf"], erstelltVon: { id: "demo-u1", name: "Anna Beispiel", email: "anna.beispiel@demo.invalid" },
    erstelltAm: tag(-80), aktualisiertAm: tag(-80),
  },
  {
    id: "demo-w2", titel: "Ansprechpartner Gewerbeaufsicht", inhalt:
      "Für Fragen zum Arbeitsschutz am Standort ist die zuständige Gewerbeaufsicht die erste Anlaufstelle, " +
      "bevor ein eigener Sachverständiger nach § 80 Abs. 3 beauftragt wird.", herkunft: "MANUELL",
    kategorien: ["Arbeitsschutz"], erstelltVon: { id: "demo-u2", name: "Jonas Mustermann", email: "jonas.mustermann@demo.invalid" },
    erstelltAm: tag(-45), aktualisiertAm: tag(-45),
  },
  {
    id: "demo-w3", titel: "Checkliste Betriebsversammlung", inhalt:
      "Raum spätestens 2 Wochen vorher buchen, Einladung an alle Beschäftigten, Tagesordnung vorher " +
      "im Intranet veröffentlichen.", herkunft: "MANUELL",
    kategorien: ["Organisation"], erstelltVon: { id: "demo-u3", name: "Lea Fiktiv", email: "lea.fiktiv@demo.invalid" },
    erstelltAm: tag(-10), aktualisiertAm: tag(-10),
  },
];

// ── Ressourcen (echte, öffentliche Links – kein Login/keine Daten nötig) ──
export const DEMO_RESSOURCEN = [
  {
    id: "demo-r1", titel: "Betriebsverfassungsgesetz (BetrVG)", url: "https://www.gesetze-im-internet.de/betrvg/",
    beschreibung: "Volltext beim BMJ", kategorie: "GESETZ", tags: ["gesetz"],
    erstelltVon: { id: "demo-u1", name: "Anna Beispiel", email: "anna.beispiel@demo.invalid" }, erstelltAm: tag(-100), aktualisiertAm: tag(-100),
  },
  {
    id: "demo-r2", titel: "Bundesagentur für Arbeit", url: "https://www.arbeitsagentur.de/",
    beschreibung: "u.a. Kurzarbeitergeld", kategorie: "BEHOERDE", tags: [],
    erstelltVon: { id: "demo-u2", name: "Jonas Mustermann", email: "jonas.mustermann@demo.invalid" }, erstelltAm: tag(-90), aktualisiertAm: tag(-90),
  },
  {
    id: "demo-r3", titel: "Musterschreiben Stellungnahme § 99", url: "https://www.gesetze-im-internet.de/betrvg/__99.html",
    beschreibung: "Als Formulierungshilfe", kategorie: "VORLAGE", tags: ["§99"],
    erstelltVon: { id: "demo-u1", name: "Anna Beispiel", email: "anna.beispiel@demo.invalid" }, erstelltAm: tag(-60), aktualisiertAm: tag(-60),
  },
];

// ── Sitzungsvorlagen ─────────────────────────────────────────────────
export const DEMO_VORLAGEN = [
  {
    id: "demo-v1", name: "Standard-Sitzung", beschreibung: "Übliche Tagesordnung für reguläre Sitzungen",
    erstelltAm: tag(-200), aktualisiertAm: tag(-200),
    tops: [
      { id: "demo-vt1", titel: "Begrüßung & Protokollkontrolle", reihenfolge: 0 },
      { id: "demo-vt2", titel: "Eingänge/Anhörungen", reihenfolge: 1 },
      { id: "demo-vt3", titel: "Verschiedenes", reihenfolge: 2 },
    ],
  },
  {
    id: "demo-v2", name: "Betriebsversammlung", beschreibung: "Tagesordnung für die quartalsweise Versammlung",
    erstelltAm: tag(-150), aktualisiertAm: tag(-150),
    tops: [
      { id: "demo-vt4", titel: "Bericht des Betriebsrats", reihenfolge: 0 },
      { id: "demo-vt5", titel: "Aussprache", reihenfolge: 1 },
    ],
  },
];

// ── Betriebsvereinbarungen ───────────────────────────────────────────
export const DEMO_BETRIEBSVEREINBARUNGEN = [
  {
    id: "demo-bv1", titel: "BV Gleitzeit 2025", abschlussdatum: tag(-120), geltungsbereich: "Alle Beschäftigten",
    status: "AKTIV", laufzeitEnde: tag(60), dokumentId: "demo-d1",
    dokument: { id: "demo-d1", titel: "BV Gleitzeit 2025", dateiname: "bv-gleitzeit-2025.pdf" },
    erstelltAm: tag(-120), aktualisiertAm: tag(-120),
  },
  {
    id: "demo-bv2", titel: "BV Mobiles Arbeiten", abschlussdatum: tag(-400), geltungsbereich: "Verwaltung",
    status: "AKTIV", laufzeitEnde: null, dokumentId: null, dokument: null,
    erstelltAm: tag(-400), aktualisiertAm: tag(-400),
  },
  {
    id: "demo-bv3", titel: "BV Altes Prämiensystem", abschlussdatum: tag(-900), geltungsbereich: "Produktion",
    status: "GEKUENDIGT", laufzeitEnde: tag(-30), dokumentId: null, dokument: null,
    erstelltAm: tag(-900), aktualisiertAm: tag(-30),
  },
];

// ── Geschäftsordnung (Register der eigenen Satzungen) ────────────────
export const DEMO_GESCHAEFTSORDNUNG = [
  {
    id: "demo-go1", beschlossenAm: tag(-500), bemerkung: "Aktuell gültige Fassung",
    dokumentId: null, dokument: null, erstelltAm: tag(-500), aktualisiertAm: tag(-500),
  },
];

// ── Beschlussregister ────────────────────────────────────────────────
export const DEMO_BESCHLUESSE = [
  {
    id: "demo-b1", antragstext: "Der Betriebsrat stimmt der Gleitzeitregelung 2025 zu.",
    rechtsgrundlage: "§ 87 Abs. 1 Nr. 2 BetrVG", jaStimmen: 5, neinStimmen: 0, enthaltungen: 0, anwesend: 5,
    ergebnis: "ANGENOMMEN", finalisiertAm: tag(-120),
    top: { nummer: 2, titel: "Gleitzeitregelung 2025", sitzung: { id: "demo-s0", titel: "Sitzung September", sitzungsdatum: tag(-125) } },
  },
  {
    id: "demo-b2", antragstext: "Der Betriebsrat verweigert die Zustimmung zur Neueinstellung im Lager mangels vollständiger Unterlagen.",
    rechtsgrundlage: "§ 99 Abs. 2 Nr. 1 BetrVG", jaStimmen: 4, neinStimmen: 1, enthaltungen: 0, anwesend: 5,
    ergebnis: "ANGENOMMEN", finalisiertAm: tag(-9),
    top: { nummer: 2, titel: "Neueinstellung Lager (§ 99)", sitzung: { id: "demo-s0", titel: "Sitzung Oktober", sitzungsdatum: tag(-30) } },
  },
  {
    id: "demo-b3", antragstext: "Der Betriebsrat beauftragt keinen externen Sachverständigen für die Arbeitszeitfrage.",
    rechtsgrundlage: "§ 80 Abs. 3 BetrVG", jaStimmen: 2, neinStimmen: 3, enthaltungen: 0, anwesend: 5,
    ergebnis: "ABGELEHNT", finalisiertAm: tag(-30),
    top: { nummer: 3, titel: "Verschiedenes", sitzung: { id: "demo-s0", titel: "Sitzung Oktober", sitzungsdatum: tag(-30) } },
  },
];

// ── Themensammlung (Auszug fürs Mitglieder-/Öffentlichkeits-Info) ───
export const DEMO_THEMEN = [
  {
    id: "demo-th1", nummer: 1, titel: "Gleitzeitregelung 2025 beschlossen",
    ergebnis: "Der Betriebsrat hat einer neuen Gleitzeitregelung zugestimmt, die ab nächstem Quartal gilt.",
    sitzung: { id: "demo-s0", titel: "Sitzung September", sitzungsdatum: tag(-125) },
  },
  {
    id: "demo-th2", nummer: 2, titel: "Rückmeldungen zur Pausenraum-Umgestaltung erwünscht",
    ergebnis: "Der Betriebsrat sammelt Ideen für die Umgestaltung des Pausenraums – Vorschläge gerne an ein Mitglied des Gremiums.",
    sitzung: { id: "demo-s0", titel: "Sitzung Oktober", sitzungsdatum: tag(-30) },
  },
];

// ── Nachrichten (interne BR-Postbox) ─────────────────────────────────
export const DEMO_NACHRICHTEN = [
  {
    id: "demo-n1", betreff: "Tagesordnung November steht", inhalt: "Die Tagesordnung für die Novembersitzung ist fertig, bitte bis Freitag durchsehen.",
    typ: "TAGESORDNUNG", absender: { id: "demo-u2", name: "Jonas Mustermann", email: "jonas.mustermann@demo.invalid" },
    gelesen: false, erstelltAm: tag(-1),
  },
  {
    id: "demo-n2", betreff: "Protokoll Oktober freigegeben", inhalt: "Das Protokoll der Oktobersitzung ist final und im Dokumentenarchiv abgelegt.",
    typ: "PROTOKOLL", absender: { id: "demo-u2", name: "Jonas Mustermann", email: "jonas.mustermann@demo.invalid" },
    gelesen: true, erstelltAm: tag(-25),
  },
];
