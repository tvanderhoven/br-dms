/**
 * API-Client – zentraler Fetch-Wrapper mit JWT
 */

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function token(): string | null {
  return localStorage.getItem("brdms_token");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...init.headers as Record<string, string> } });

  if (res.status === 401) {
    localStorage.removeItem("brdms_token");
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
      throw new Error("Sitzung abgelaufen");
    }
    // Auf der Login-Seite: Fehler normal auswerten (z.B. "E-Mail oder Passwort falsch")
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.fehler ?? `HTTP ${res.status}`);
  return data as T;
}

// ── Auth ──────────────────────────────────────────────────────────
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  suche: (q: string) => request<SuchErgebnis>(`/api/suche?q=${encodeURIComponent(q)}`),

  auth: {
    login: (email: string, passwort: string) =>
      request<{ token: string; benutzer: Benutzer }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, passwort }),
      }),
    me: () => request<Benutzer>("/api/auth/me"),
  },

  dokumente: {
    liste: () => request<Dokument[]>("/api/dokumente"),
    einzel: (id: string) => request<Dokument>(`/api/dokumente/${id}`),
    upload: (formData: FormData) =>
      request<Dokument>("/api/dokumente", { method: "POST", body: formData }),
    aktualisieren: (id: string, data: Partial<Pick<Dokument, "alias" | "tags" | "kategorie" | "aktenzeichen" | "beschreibung" | "vertraulich" | "deleteAt" | "wiedervorlageAm">>) =>
      request<Dokument>(`/api/dokumente/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    loeschen: (id: string) =>
      request<{ nachricht: string }>(`/api/dokumente/${id}`, { method: "DELETE" }),
    downloadUrl: (id: string) => `${BASE}/api/dokumente/${id}/download`,
    vorschauUrl: (id: string) => `${BASE}/api/dokumente/${id}/vorschau`,

    inbox: () => request<Dokument[]>("/api/dokumente/inbox"),
    inboxGelesenMarkieren: (id: string) =>
      request<{ ok: boolean }>(`/api/dokumente/${id}/inbox-gelesen`, { method: "PATCH" }),
    suche: (q: string, kategorie?: string) =>
      request<Dokument[]>(`/api/dokumente/suche?q=${encodeURIComponent(q)}${kategorie ? `&kategorie=${kategorie}` : ""}`),
    verknuepfungen: (id: string) =>
      request<DokumentVerknuepfungen>(`/api/dokumente/${id}/verknuepfungen`),

    aktionSitzungTop: (id: string, data: { sitzungId: string; topTitel: string; topId?: string; fristDatum?: string }) =>
      request<{ topId: string }>(`/api/dokumente/${id}/aktionen/sitzung-top`, { method: "POST", body: JSON.stringify(data) }),
    aktionWissensarchiv: (id: string, data: { tags?: string[]; kategorie?: string }) =>
      request<Dokument>(`/api/dokumente/${id}/aktionen/wissensarchiv`, { method: "POST", body: JSON.stringify(data) }),
    aktionAufgabe: (id: string, data: { titel: string; zugewiesenAnId?: string; prioritaet?: string; faelligAm?: string }) =>
      request<{ id: string }>(`/api/dokumente/${id}/aktionen/aufgabe`, { method: "POST", body: JSON.stringify(data) }),
    aktionErledigt: (id: string) =>
      request<{ ok: boolean }>(`/api/dokumente/${id}/aktionen/erledigt`, { method: "POST", body: JSON.stringify({}) }),

    versionen: (id: string) => request<DokumentVersion[]>(`/api/dokumente/${id}/versionen`),
    versionHochladen: (id: string, formData: FormData) =>
      request<DokumentVersion>(`/api/dokumente/${id}/versionen`, { method: "POST", body: formData }),
    versionDownloadUrl: (id: string, vid: string) => `${BASE}/api/dokumente/${id}/versionen/${vid}/download`,
  },

  aufgaben: {
    liste:       () => request<Aufgabe[]>("/api/aufgaben"),
    erstellen:   (data: AufgabeErstellen) => request<Aufgabe>("/api/aufgaben", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<AufgabeErstellen & { erledigt: boolean }>) =>
      request<Aufgabe>(`/api/aufgaben/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    loeschen:    (id: string) => request<{ nachricht: string }>(`/api/aufgaben/${id}`, { method: "DELETE" }),
  },

  sitzungen: {
    liste: () => request<SitzungListItem[]>("/api/sitzungen"),
    einzel: (id: string) => request<Sitzung>(`/api/sitzungen/${id}`),
    erstellen: (data: { titel: string; sitzungsdatum: string; ort?: string; sitzungstyp?: string; notizen?: string; vorlageId?: string }) =>
      request<Sitzung>("/api/sitzungen", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<{ titel: string; sitzungsdatum: string; ort: string; sitzungstyp: string; notizen: string }>) =>
      request<Sitzung>(`/api/sitzungen/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    absagen: (id: string) =>
      request<{ nachricht: string }>(`/api/sitzungen/${id}`, { method: "DELETE" }),
    fixieren: (id: string) =>
      request<Sitzung>(`/api/sitzungen/${id}/fixieren`, { method: "POST" }),
    einladungSenden: (id: string) =>
      request<{ nachricht: string }>(`/api/sitzungen/${id}/einladung`, { method: "POST" }),
    protokollStarten: (id: string) =>
      request<Sitzung>(`/api/sitzungen/${id}/protokoll`, { method: "POST" }),
    finalisieren: (id: string) =>
      request<Sitzung>(`/api/sitzungen/${id}/finalisieren`, { method: "POST" }),
    topHinzufuegen: (id: string, data: { titel: string; inhalt?: string; inhaltsJson?: object }) =>
      request<TOP>(`/api/sitzungen/${id}/tops`, { method: "POST", body: JSON.stringify(data) }),
    topAktualisieren: (id: string, topId: string, data: Partial<{ titel: string; inhalt: string; inhaltsJson: object; ergebnis: string; ergebnisJson: object; topStatus: TopStatus }>) =>
      request<TOP>(`/api/sitzungen/${id}/tops/${topId}`, { method: "PATCH", body: JSON.stringify(data) }),
    topLoeschen: (id: string, topId: string) =>
      request<{ nachricht: string }>(`/api/sitzungen/${id}/tops/${topId}`, { method: "DELETE" }),
    topReihenfolge: (id: string, topIds: string[]) =>
      request<{ ok: boolean }>(`/api/sitzungen/${id}/tops/reihenfolge`, { method: "PUT", body: JSON.stringify({ topIds }) }),
    anwesenheitslisteUrl: (id: string) => `${BASE}/api/sitzungen/${id}/anwesenheitsliste`,
    topAuszugUrl: (sitzungId: string, topId: string) => `${BASE}/api/sitzungen/${sitzungId}/tops/${topId}/auszug`,
    dokumentVerknuepfen: (id: string, topId: string, dokumentId: string, hinweis?: string) =>
      request<TopDokumentInfo>(`/api/sitzungen/${id}/tops/${topId}/dokumente`, {
        method: "POST",
        body: JSON.stringify({ dokumentId, hinweis }),
      }),
    dokumentEntknuepfen: (id: string, topId: string, dokumentId: string) =>
      request<{ nachricht: string }>(`/api/sitzungen/${id}/tops/${topId}/dokumente/${dokumentId}`, { method: "DELETE" }),
    spontanTop: (id: string, titel: string) =>
      request<TOP>(`/api/sitzungen/${id}/spontan-top`, { method: "POST", body: JSON.stringify({ titel }) }),
    pdfNeuGenerieren: (id: string, versionNummer: string) =>
      request<{ nachricht: string }>(`/api/sitzungen/${id}/pdf/${versionNummer}`, { method: "POST" }),
  },

  watchfolder: {
    log: () => request<WatchfolderLogEintrag[]>("/api/watchfolder/log"),
  },

  audit: {
    liste: (params: { seite?: number; benutzerId?: string; aktion?: string; von?: string; bis?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.seite)      q.set("seite",      String(params.seite));
      if (params.benutzerId) q.set("benutzerId", params.benutzerId);
      if (params.aktion)     q.set("aktion",     params.aktion);
      if (params.von)        q.set("von",        params.von);
      if (params.bis)        q.set("bis",        params.bis);
      return request<AuditSeite>(`/api/audit?${q.toString()}`);
    },
  },

  ressourcen: {
    liste:         () => request<Ressource[]>("/api/ressourcen"),
    erstellen:     (data: RessourceErstellen) => request<Ressource>("/api/ressourcen", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<RessourceErstellen>) => request<Ressource>(`/api/ressourcen/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    loeschen:      (id: string) => request<{ ok: boolean }>(`/api/ressourcen/${id}`, { method: "DELETE" }),
  },

  wissen: {
    liste:         () => request<WissensEintrag[]>("/api/wissen"),
    suche:         (q: string) => request<WissensEintrag[]>(`/api/wissen/suche?q=${encodeURIComponent(q)}`),
    erstellen:     (data: WissensEintragErstellen) => request<WissensEintrag>("/api/wissen", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<WissensEintragErstellen>) => request<WissensEintrag>(`/api/wissen/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    loeschen:      (id: string) => request<{ ok: boolean }>(`/api/wissen/${id}`, { method: "DELETE" }),
  },

  vorlagen: {
    liste:         () => request<SitzungsVorlage[]>("/api/vorlagen"),
    erstellen:     (data: { name: string; beschreibung?: string }) => request<SitzungsVorlage>("/api/vorlagen", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: { name?: string; beschreibung?: string }) => request<SitzungsVorlage>(`/api/vorlagen/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    loeschen:      (id: string) => request<{ ok: boolean }>(`/api/vorlagen/${id}`, { method: "DELETE" }),
    topHinzufuegen: (id: string, data: { titel: string; inhalt?: string; inhaltsJson?: object | null }) => request<VorlageTOP>(`/api/vorlagen/${id}/tops`, { method: "POST", body: JSON.stringify(data) }),
    topAktualisieren: (id: string, topId: string, data: { titel?: string; inhalt?: string; inhaltsJson?: object | null; reihenfolge?: number }) => request<VorlageTOP>(`/api/vorlagen/${id}/tops/${topId}`, { method: "PATCH", body: JSON.stringify(data) }),
    topLoeschen:   (id: string, topId: string) => request<{ ok: boolean }>(`/api/vorlagen/${id}/tops/${topId}`, { method: "DELETE" }),
  },

  themen: {
    liste: (params: { von?: string; bis?: string; stichwort?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.von)       q.set("von",       params.von);
      if (params.bis)       q.set("bis",       params.bis);
      if (params.stichwort) q.set("stichwort", params.stichwort);
      return request<ThemenEintrag[]>(`/api/themen?${q}`);
    },
  },

  einstellungen: {
    aufbewahrung: () => request<Aufbewahrungsregel[]>("/api/einstellungen/aufbewahrung"),
    aufbewahrungSpeichern: (kategorie: string, data: { tage: number; rechtsgrundlage?: string; beschreibung?: string }) =>
      request<Aufbewahrungsregel>(`/api/einstellungen/aufbewahrung/${kategorie}`, { method: "PUT", body: JSON.stringify(data) }),
    protokoll: () => request<ProtokollEinstellungen>("/api/einstellungen/protokoll"),
    protokollSpeichern: (data: Partial<Omit<ProtokollEinstellungen, "hat_logo">>) =>
      request<{ ok: boolean }>("/api/einstellungen/protokoll", { method: "PUT", body: JSON.stringify(data) }),
    logoHochladen: (formData: FormData) =>
      request<{ ok: boolean }>("/api/einstellungen/protokoll/logo", { method: "POST", body: formData }),
    logoLoeschen: () =>
      request<{ ok: boolean }>("/api/einstellungen/protokoll/logo", { method: "DELETE" }),
    logoUrl: () => `${BASE}/api/einstellungen/protokoll/logo`,
    design: () => request<DesignEinstellungen>("/api/einstellungen/design"),
    designSpeichern: (data: Partial<DesignEinstellungen>) =>
      request<{ ok: boolean }>("/api/einstellungen/design", { method: "PUT", body: JSON.stringify(data) }),
    system: () => request<{ watchFolderPfad: string; watchFolderAktiv: boolean }>("/api/einstellungen/system"),
  },

  fristen: {
    liste: (params: { von?: string; bis?: string; status?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.von)    q.set("von",    params.von);
      if (params.bis)    q.set("bis",    params.bis);
      if (params.status) q.set("status", params.status);
      return request<FristMitDokument[]>(`/api/fristen?${q}`);
    },
  },

  beschluesse: {
    register: (params: { sitzungId?: string; von?: string; bis?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.sitzungId) q.set("sitzungId", params.sitzungId);
      if (params.von)       q.set("von",       params.von);
      if (params.bis)       q.set("bis",       params.bis);
      return request<BeschlussRegisterEintrag[]>(`/api/beschluesse?${q}`);
    },
  },

  export: {
    amtsuebergabeUrl: () => `${BASE}/api/export/amtsuebergabe`,
    briefvorlageUrl:  (dokumentId: string, typ: "widerspruch_99" | "zustimmungsverweigerung_102") =>
      `${BASE}/api/export/briefvorlage/${dokumentId}/${typ}`,
  },

  nachrichten: {
    liste:       () => request<Nachricht[]>("/api/nachrichten"),
    gesendet:    () => request<NachrichtGesendet[]>("/api/nachrichten/gesendet"),
    senden:      (data: NachrichtSenden) => request<Nachricht>("/api/nachrichten", { method: "POST", body: JSON.stringify(data) }),
    alsGelesen:  (id: string) => request<Nachricht>(`/api/nachrichten/${id}/gelesen`, { method: "PATCH", body: "{}" }),
    loeschen:    (id: string) => request<{ nachricht: string }>(`/api/nachrichten/${id}`, { method: "DELETE" }),
    ungelesen:   () => request<Nachricht[]>("/api/nachrichten").then(l => l.filter(n => !n.gelesen)),
  },
};

// ── Typen ─────────────────────────────────────────────────────────
export interface ProtokollEinstellungen {
  kopfzeile:            string;
  unterzeile:           string;
  farbe:                string;
  fusszeile:            string;
  unterschrift_vorsitz: string;
  unterschrift_zeuge:   string;
  kopfzeile_layout:     string; // "logo_links" | "logo_rechts" | "balken"
  fusszeile_layout:     string; // "text_links" | "text_rechts"
  hat_logo:             string; // "true" | "false"
}

export type Rolle = "VORSITZ" | "STELLVERTRETER" | "MITGLIED" | "ERSATZMITGLIED" | "ADMIN";
export type Prioritaet = "HOCH" | "MITTEL" | "NIEDRIG";
export type Sichtbarkeit = "PRIVAT" | "OEFFENTLICH";
export type AufgabeTyp = "PROJEKT" | "AUFGABE";

export interface Aufgabe {
  id: string;
  titel: string;
  beschreibung?: string;
  typ: AufgabeTyp;
  prioritaet: Prioritaet;
  startDatum?: string;
  endDatum?: string;
  faelligAm?: string;
  farbe?: string;
  erledigt: boolean;
  erledigtAm?: string;
  sichtbarkeit: Sichtbarkeit;
  oberProjektId?: string;
  oberProjekt?: { id: string; titel: string; farbe?: string };
  erstelltVon: { id: string; name: string; email: string };
  zugewiesenAn?: { id: string; name: string; email: string };
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface AufgabeErstellen {
  titel: string;
  beschreibung?: string;
  typ?: AufgabeTyp;
  prioritaet?: Prioritaet;
  startDatum?: string;
  endDatum?: string;
  faelligAm?: string;
  farbe?: string;
  zugewiesenAnId?: string;
  sichtbarkeit?: Sichtbarkeit;
  oberProjektId?: string;
}

export interface Benutzer {
  id: string; name: string; email: string; rolle: Rolle;
  aktiv: boolean; letzterLogin?: string; istVertretungFuer?: string;
}

export type Kategorie =
  | "ANHOERUNG_99" | "ANHOERUNG_102"
  | "BEWERBUNG" | "BEWERBUNG_ALTERNATIV"
  | "ZEITMODELL_87"
  | "PROTOKOLL" | "BETRIEBSVEREINBARUNG" | "SONSTIGES";

export type DokumentStatus = "AKTIV" | "ARCHIVIERT" | "LOESCHVORMERKUNG" | "GELOESCHT";

export interface Frist {
  id: string; typ: string; faelligAm: string; status: string;
}

export interface Dokument {
  id: string; titel: string; alias?: string; tags: string[];
  kategorie: Kategorie; status: DokumentStatus;
  dateiname: string; dateigroesse: number; mimeTyp: string;
  aktenzeichen?: string; beschreibung?: string; vertraulich: boolean;
  inboxGelesen: boolean; inboxGelesenAm?: string; inboxQuelle?: string;
  deleteAt?: string; wiedervorlageAm?: string | null; erstelltAm: string;
  textinhalt?: string | null;
  hochgeladenVon?: { name: string };
  fristen?: Frist[];
}

export interface FristMitDokument {
  id: string;
  typ: string;
  status: string;
  faelligAm: string;
  bezeichnung?: string;
  erledigtAm?: string;
  erledigtVon?: { name: string } | null;
  erstelltAm: string;
  dokument: { id: string; titel: string; alias?: string; kategorie: Kategorie; aktenzeichen?: string };
}

export interface BeschlussRegisterEintrag {
  id: string;
  antragstext: string;
  rechtsgrundlage: string;
  jaStimmen: number;
  neinStimmen: number;
  enthaltungen: number;
  anwesend: number;
  ergebnis: string | null;
  finalisiertAm?: string;
  finalisiertVonId?: string | null;
  top: {
    nummer: number;
    titel: string;
    sitzung: { id: string; titel: string; sitzungsdatum: string };
  };
}

export interface DokumentVersion {
  id: string;
  version: number;
  dateiname: string;
  dateigroesse: number;
  aenderungsnotiz?: string | null;
  erstelltAm: string;
  erstelltVon: string;
}

export interface DokumentVerknuepfungen {
  tops: Array<{
    id: string; nummer: number; titel: string; status: string;
    sitzung: { id: string; titel: string; sitzungsdatum: string };
    beschluesse: Array<{ id: string; antragstext: string; ergebnis: string | null }>;
  }>;
  aufgaben: Array<{
    id: string; titel: string; prioritaet: string; erledigt: boolean; faelligAm?: string;
    zugewiesenAn?: { name: string };
  }>;
}

// ── Sitzungsmanagement ────────────────────────────────────────────
export type SitzungStatus =
  | "ENTWURF" | "TAGESORDNUNG_FIXIERT" | "PROTOKOLL_ENTWURF" | "PROTOKOLL_FINAL" | "ABGESAGT";

export type TopStatus =
  | "OFFEN" | "BESCHLOSSEN" | "ABGELEHNT" | "VERTAGT" | "ZUR_KENNTNIS";

export interface TopDokumentInfo {
  id: string;
  hinweis?: string;
  dokument: { id: string; titel: string; kategorie: Kategorie; dateiname: string; aktenzeichen?: string };
}

export interface TOP {
  id: string;
  sitzungId: string;
  nummer: number;
  titel: string;
  inhalt?: string;
  inhaltsJson?: object;
  ergebnis?: string;
  ergebnisJson?: object;
  status: TopStatus;
  spontan: boolean;
  dokumente: TopDokumentInfo[];
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface SitzungVersion {
  id: string;
  versionNummer: string;
  typ: string;
  readonly: boolean;
  einladungVersendetAm?: string;
  finalisiertAm?: string;
  erstelltAm: string;
}

export interface Sitzung {
  id: string;
  titel: string;
  sitzungsdatum: string;
  ort?: string;
  sitzungstyp: string;
  status: SitzungStatus;
  notizen?: string;
  erstelltVon?: { id: string; name: string };
  versionen: SitzungVersion[];
  tops: TOP[];
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface SitzungListItem {
  id: string;
  titel: string;
  sitzungsdatum: string;
  ort?: string;
  sitzungstyp: string;
  status: SitzungStatus;
  erstelltAm: string;
  erstelltVon?: { name: string };
  _count: { tops: number };
  versionen: { versionNummer: string; typ: string }[];
}

export interface BeschlussStimme {
  benutzerId: string;
  stimme: string;
  vertretungFuer?: string | null;
}

export interface Beschluss {
  id: string;
  topId: string;
  antragstext: string;
  rechtsgrundlage: string;
  reihenfolge: number;
  jaStimmen: number;
  neinStimmen: number;
  enthaltungen: number;
  anwesend: number;
  ergebnis: string | null;
  finalisiert: boolean;
  finalisiertAm?: string;
  erstelltAm: string;
  stimmen: BeschlussStimme[];
}

export interface Kommentar {
  id: string;
  inhalt: string;
  erstelltAm: string;
  aktualisiertAm: string;
  autor: { id: string; name: string; email: string };
}

export interface Aufbewahrungsregel {
  kategorie:       string;
  tage:            number;
  rechtsgrundlage: string | null;
  beschreibung:    string | null;
  istStandard:     boolean;
}

export interface SuchErgebnis {
  dokumente:  { id: string; titel: string; alias?: string; kategorie: Kategorie; status: DokumentStatus; tags: string[]; dateiname: string; erstelltAm: string }[];
  sitzungen:  { id: string; titel: string; sitzungsdatum: string; status: SitzungStatus }[];
  aufgaben?:  { id: string; titel: string; prioritaet: Prioritaet; erledigt: boolean; faelligAm?: string }[];
  wissen?:    { id: string; titel: string; kategorien: string[]; erstelltAm: string }[];
  ressourcen?: { id: string; titel: string; url: string; kategorie: RessourceKategorie; erstelltAm: string }[];
}

export const SITZUNG_STATUS_LABEL: Record<SitzungStatus, string> = {
  ENTWURF:              "Entwurf",
  TAGESORDNUNG_FIXIERT: "Tagesordnung fixiert",
  PROTOKOLL_ENTWURF:    "Protokoll in Bearbeitung",
  PROTOKOLL_FINAL:      "Protokoll final",
  ABGESAGT:             "Abgesagt",
};

export const TOP_STATUS_LABEL: Record<TopStatus, string> = {
  OFFEN:         "Offen",
  BESCHLOSSEN:   "Beschlossen",
  ABGELEHNT:     "Abgelehnt",
  VERTAGT:       "Vertagt",
  ZUR_KENNTNIS:  "Zur Kenntnis",
};

export interface VorlageTOP {
  id: string;
  titel: string;
  inhalt?: string | null;
  inhaltsJson?: object | null;
  reihenfolge: number;
}

export interface SitzungsVorlage {
  id: string;
  name: string;
  beschreibung?: string | null;
  erstelltAm: string;
  aktualisiertAm: string;
  tops: VorlageTOP[];
}

export interface Nachricht {
  id: string;
  betreff: string;
  inhalt: string;
  typ: "NORMAL" | "TAGESORDNUNG" | "PROTOKOLL" | "SYSTEM";
  absender?: { id: string; name: string; email: string };
  sitzung?: { id: string; titel: string; sitzungsdatum: string };
  pdfDateiname?: string;
  gelesen: boolean;
  gelesenAm?: string;
  erstelltAm: string;
}

export interface NachrichtGesendet extends Nachricht {
  empfaenger: { id: string; name: string; email: string };
}

export interface NachrichtSenden {
  betreff: string;
  inhalt: string;
  empfaengerId?: string;
  alle?: boolean;
  sitzungId?: string;
}

export interface WatchfolderLogEintrag {
  id: string;
  aktion: "WATCHFOLDER_DATEI_EMPFANGEN" | "WATCHFOLDER_FEHLER";
  details: { dateiname?: string; fehler?: string; kategorie?: string } | null;
  zeitpunkt: string;
}

export interface WissensEintrag {
  id: string;
  titel: string;
  inhalt: string;
  herkunft: string;
  quelle?: { sitzungId?: string; topId?: string; protocolBlockId?: string } | null;
  kategorien: string[];
  loesung?: string | null;
  erstelltVon: { id: string; name: string; email: string };
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface DesignEinstellungen {
  sidebar_farbe:   string;
  akzent_farbe:    string;
  text_farbe:      string;
  hintergrund:     string;
  schrift_groesse: string;
  dark_mode:       string;
}

export interface ThemenEintrag {
  id:           string;
  nummer:       number;
  titel:        string;
  ergebnis?:    string | null;
  ergebnisJson?: unknown;
  sitzung: {
    id:            string;
    titel:         string;
    sitzungsdatum: string;
    status:        string;
  };
}

// ── Audit-Log ─────────────────────────────────────────────────────
export type AuditAktion =
  | "LOGIN" | "LOGOUT" | "ZUGRIFF_VERWEIGERT" | "PASSWORT_GEAENDERT"
  | "DOKUMENT_ERSTELLT" | "DOKUMENT_ANGESEHEN" | "DOKUMENT_HERUNTERGELADEN"
  | "DOKUMENT_AKTUALISIERT" | "DOKUMENT_GELOESCHT" | "DOKUMENT_METADATEN_GEAENDERT"
  | "DOKUMENT_TAG_GEAENDERT" | "DOKUMENT_ALIAS_GEAENDERT" | "DOKUMENT_TOP_GEAENDERT"
  | "DOKUMENT_AUFGABE_ERSTELLT" | "INBOX_DOKUMENT_GELESEN" | "WATCHFOLDER_DATEI_EMPFANGEN"
  | "FRIST_ERSTELLT" | "FRIST_ERLEDIGT"
  | "BENUTZER_ERSTELLT" | "BENUTZER_DEAKTIVIERT"
  | "SITZUNG_ERSTELLT" | "SITZUNG_AKTUALISIERT" | "SITZUNG_FIXIERT"
  | "SITZUNG_PROTOKOLL_GESTARTET" | "SITZUNG_FINALISIERT" | "SITZUNG_GELOESCHT"
  | "ABSTIMMUNG_ERSTELLT" | "ABSTIMMUNG_FINALISIERT"
  | "NACHRICHT_GESENDET" | "WATCHFOLDER_FEHLER"
  | "WISSEN_ERSTELLT" | "WISSEN_AKTUALISIERT" | "WISSEN_GELOESCHT";

export interface AuditEintrag {
  id:        string;
  aktion:    AuditAktion;
  ip:        string | null;
  details:   Record<string, unknown> | null;
  zeitpunkt: string;
  benutzer:  { id: string; name: string; email: string } | null;
  dokument:  { id: string; titel: string; alias: string | null } | null;
  sitzung:   { id: string; titel: string } | null;
}

export interface AuditSeite {
  eintraege: AuditEintrag[];
  gesamt:    number;
  seite:     number;
  seiten:    number;
}

export const AUDIT_AKTION_LABEL: Record<AuditAktion, string> = {
  LOGIN:                       "Anmeldung",
  LOGOUT:                      "Abmeldung",
  ZUGRIFF_VERWEIGERT:          "Zugriff verweigert",
  PASSWORT_GEAENDERT:          "Passwort geändert",
  DOKUMENT_ERSTELLT:           "Dokument erstellt",
  DOKUMENT_ANGESEHEN:          "Dokument angesehen",
  DOKUMENT_HERUNTERGELADEN:    "Dokument heruntergeladen",
  DOKUMENT_AKTUALISIERT:       "Dokument aktualisiert",
  DOKUMENT_GELOESCHT:          "Dokument gelöscht",
  DOKUMENT_METADATEN_GEAENDERT:"Metadaten geändert",
  DOKUMENT_TAG_GEAENDERT:      "Tags geändert",
  DOKUMENT_ALIAS_GEAENDERT:    "Alias geändert",
  DOKUMENT_TOP_GEAENDERT:      "TOP-Zuweisung geändert",
  DOKUMENT_AUFGABE_ERSTELLT:   "Aufgabe aus Dokument erstellt",
  INBOX_DOKUMENT_GELESEN:      "Eingang gelesen",
  WATCHFOLDER_DATEI_EMPFANGEN: "WatchFolder – Datei importiert",
  FRIST_ERSTELLT:              "Frist erstellt",
  FRIST_ERLEDIGT:              "Frist erledigt",
  BENUTZER_ERSTELLT:           "Benutzer angelegt",
  BENUTZER_DEAKTIVIERT:        "Benutzer deaktiviert",
  SITZUNG_ERSTELLT:            "Sitzung erstellt",
  SITZUNG_AKTUALISIERT:        "Sitzung aktualisiert",
  SITZUNG_FIXIERT:             "Sitzung fixiert",
  SITZUNG_PROTOKOLL_GESTARTET: "Protokoll gestartet",
  SITZUNG_FINALISIERT:         "Protokoll finalisiert",
  SITZUNG_GELOESCHT:           "Sitzung gelöscht",
  ABSTIMMUNG_ERSTELLT:         "Abstimmung erstellt",
  ABSTIMMUNG_FINALISIERT:      "Abstimmung finalisiert",
  NACHRICHT_GESENDET:          "Nachricht gesendet",
  WATCHFOLDER_FEHLER:          "WatchFolder – Fehler",
  WISSEN_ERSTELLT:             "Wissenseintrag erstellt",
  WISSEN_AKTUALISIERT:         "Wissenseintrag aktualisiert",
  WISSEN_GELOESCHT:            "Wissenseintrag gelöscht",
};

export type RessourceKategorie = "GESETZ" | "KI_WERKZEUG" | "BEHOERDE" | "VORLAGE" | "SONSTIGES";

export interface Ressource {
  id: string;
  titel: string;
  url: string;
  beschreibung?: string | null;
  kategorie: RessourceKategorie;
  tags: string[];
  erstelltVon: { id: string; name: string; email: string };
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface RessourceErstellen {
  titel: string;
  url: string;
  beschreibung?: string;
  kategorie?: RessourceKategorie;
  tags?: string[];
}

export const RESSOURCE_KATEGORIE_LABEL: Record<RessourceKategorie, string> = {
  GESETZ:      "Gesetze & Recht",
  KI_WERKZEUG: "KI-Werkzeuge",
  BEHOERDE:    "Behörden & Formulare",
  VORLAGE:     "Vorlagen & Muster",
  SONSTIGES:   "Sonstiges",
};

export const RESSOURCE_KATEGORIE_FARBE: Record<RessourceKategorie, string> = {
  GESETZ:      "bg-blue-100 text-blue-700",
  KI_WERKZEUG: "bg-purple-100 text-purple-700",
  BEHOERDE:    "bg-green-100 text-green-700",
  VORLAGE:     "bg-orange-100 text-orange-700",
  SONSTIGES:   "bg-gray-100 text-gray-600",
};

export interface WissensEintragErstellen {
  titel: string;
  inhalt: string;
  kategorien?: string[];
  loesung?: string;
  herkunft?: string;
  quelle?: { sitzungId?: string; topId?: string; protocolBlockId?: string };
}

// ── Hilfsfunktionen ───────────────────────────────────────────────
export const KATEGORIE_LABEL: Record<Kategorie, string> = {
  ANHOERUNG_99:         "§ 99 BetrVG – Einstellung/Versetzung",
  ANHOERUNG_102:        "§ 102 BetrVG – Kündigung",
  BEWERBUNG:            "Bewerbung",
  BEWERBUNG_ALTERNATIV: "Alternative Bewerbung (§ 99)",
  ZEITMODELL_87:        "§ 87 BetrVG – Zeitmodelländerung",
  PROTOKOLL:            "Sitzungsprotokoll",
  BETRIEBSVEREINBARUNG: "Betriebsvereinbarung",
  SONSTIGES:            "Sonstiges",
};

export function fristFarbe(datum: string): string {
  const tage = Math.ceil((new Date(datum).getTime() - Date.now()) / 86_400_000);
  if (tage < 0)  return "text-red-700 bg-red-50 border-red-200";
  if (tage <= 3) return "text-red-600 bg-red-50 border-red-200";
  if (tage <= 7) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-green-700 bg-green-50 border-green-200";
}

export function formatDatum(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit", year:"numeric" });
}

export function formatDateigroesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
