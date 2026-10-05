/**
 * API-Client – zentraler Fetch-Wrapper mit JWT
 */

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function token(): string | null {
  return localStorage.getItem("brdms_token");
}

// Verhindert mehrfache gleichzeitige Redirects bei parallelen 401-Antworten
let redirectingToLogin = false;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...init.headers as Record<string, string> } });

  // 401 beim Login heißt "falsche Zugangsdaten", nicht "Sitzung abgelaufen" –
  // dort fällt es unten durch und zeigt die Fehlermeldung des Backends.
  if (res.status === 401 && path !== "/api/auth/login") {
    localStorage.removeItem("brdms_token");
    if (window.location.pathname !== "/login" && !redirectingToLogin) {
      redirectingToLogin = true;
      window.location.href = "/login";
    }
    throw new Error("Sitzung abgelaufen");
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

  gesetze: {
    status:        () => request<GesetzStatus[]>("/api/gesetze/status"),
    aktualisieren: () => request<{ ergebnisse: GesetzAktualisierenErgebnis[] }>(
      "/api/gesetze/aktualisieren", { method: "POST" },
    ),
    workerTesten: () => request<{
      ergebnisse: GesetzAktualisierenErgebnis[];
      relevanteAenderungen: { gesetz: string; paragraphen: string[] }[];
      benachrichtigt: string[];
    }>("/api/gesetze/worker-testen", { method: "POST" }),
    einzel: (id: string) => request<GesetzParagraph>(`/api/gesetze/${id}`),
  },

  auth: {
    login: (email: string, passwort: string, eingeloggtBleiben = true) =>
      request<{ token: string; benutzer: Benutzer }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, passwort, eingeloggtBleiben }),
      }),
    me: () => request<Benutzer>("/api/auth/me"),
    passwortAendern: (aktuellesPasswort: string, neuesPasswort: string) =>
      request<{ nachricht: string }>("/api/auth/passwort", {
        method: "PATCH",
        body: JSON.stringify({ aktuellesPasswort, neuesPasswort }),
      }),
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
    aktualisieren: (id: string, data: Partial<Omit<AufgabeErstellen, "topId" | "kanbanStatus"> & { erledigt: boolean; topId: string | null; kanbanStatus: KanbanStatus | null }>) =>
      request<Aufgabe>(`/api/aufgaben/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    loeschen:    (id: string) => request<{ nachricht: string }>(`/api/aufgaben/${id}`, { method: "DELETE" }),
  },

  sitzungen: {
    liste: () => request<SitzungListItem[]>("/api/sitzungen"),
    einzel: (id: string) => request<Sitzung>(`/api/sitzungen/${id}`),
    erstellen: (data: { titel: string; sitzungsdatum: string; ort?: string; sitzungstyp?: string; notizen?: string; vorlageId?: string }) =>
      request<Sitzung>("/api/sitzungen", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<{ titel: string; sitzungsdatum: string; ort: string; sitzungstyp: string; notizen: string; teilnehmerzahl: number | null }>) =>
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
    topHinzufuegen: (id: string, data: { titel: string; inhalt?: string; inhaltsJson?: object; vertraulich?: boolean }) =>
      request<TOP>(`/api/sitzungen/${id}/tops`, { method: "POST", body: JSON.stringify(data) }),
    topAktualisieren: (id: string, topId: string, data: Partial<{ titel: string; inhalt: string; inhaltsJson: object; ergebnis: string; ergebnisJson: object; topStatus: TopStatus; vertraulich: boolean }>) =>
      request<TOP>(`/api/sitzungen/${id}/tops/${topId}`, { method: "PATCH", body: JSON.stringify(data) }),
    topLoeschen: (id: string, topId: string) =>
      request<{ nachricht: string }>(`/api/sitzungen/${id}/tops/${topId}`, { method: "DELETE" }),
    topReihenfolge: (id: string, topIds: string[]) =>
      request<{ ok: boolean }>(`/api/sitzungen/${id}/tops/reihenfolge`, { method: "PUT", body: JSON.stringify({ topIds }) }),
    anwesenheitslisteUrl: (id: string) => `${BASE}/api/sitzungen/${id}/anwesenheitsliste`,
    einladung: (id: string) => request<EinladungStand>(`/api/sitzungen/${id}/einladung`),
    einladungVersenden: (id: string, benutzerIds?: string[]) =>
      request<{ gesendet: number; fehlgeschlagen: number }>(`/api/sitzungen/${id}/einladung/versenden`, {
        method: "POST", body: JSON.stringify(benutzerIds ? { benutzerIds } : {}),
      }),
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
    ersatzVorschlag: (id: string, abwesenderId: string) =>
      request<{
        vorschlag: { id: string; name: string } | null;
        warnung: string | null;
        alternative: { id: string; name: string } | null;
      }>(`/api/sitzungen/${id}/ersatz-vorschlag?abwesenderId=${encodeURIComponent(abwesenderId)}`),
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

  mitarbeiter: {
    liste:         () => request<Mitarbeiter[]>("/api/mitarbeiter"),
    erstellen:     (data: { vorname: string; nachname: string; abteilungId?: string; pnr?: string; eintritt?: string; austritt?: string; standort?: string; geburtsdatum?: string; geschlecht?: Geschlecht | null; beschaeftigungsart?: Beschaeftigungsart }) =>
      request<Mitarbeiter>("/api/mitarbeiter", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<{ vorname: string; nachname: string; abteilungId: string | null; pnr: string; eintritt: string; austritt: string; standort: string | null; geburtsdatum: string; geschlecht: Geschlecht | null; gehaltIgnorieren: boolean; beschaeftigungsart: Beschaeftigungsart }>) =>
      request<Mitarbeiter>(`/api/mitarbeiter/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    loeschen:      (id: string) => request<{ ok: boolean }>(`/api/mitarbeiter/${id}`, { method: "DELETE" }),
    standortBatch: (ids: string[], standort: string | null) =>
      request<{ aktualisiert: number }>("/api/mitarbeiter/standort-batch", { method: "PATCH", body: JSON.stringify({ ids, standort }) }),
    importieren: (datei: File, dryRun: boolean) => {
      const formData = new FormData();
      formData.append("file", datei);
      return request<MitarbeiterImportZusammenfassung>(
        `/api/mitarbeiter/import?dryRun=${dryRun ? "true" : "false"}`,
        { method: "POST", body: formData }
      );
    },
  },

  abteilungen: {
    liste:     () => request<Abteilung[]>("/api/abteilungen"),
    erstellen: (name: string) => request<Abteilung>("/api/abteilungen", { method: "POST", body: JSON.stringify({ name }) }),
  },

  gehaltstabelle: {
    liste: (params: { abteilungId?: string; mitarbeiterId?: string; von?: string; bis?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.abteilungId)   q.set("abteilungId",   params.abteilungId);
      if (params.mitarbeiterId) q.set("mitarbeiterId", params.mitarbeiterId);
      if (params.von)           q.set("von",           params.von);
      if (params.bis)           q.set("bis",           params.bis);
      return request<GehaltsstufenEintrag[]>(`/api/gehaltstabelle?${q.toString()}`);
    },
    erstellen: (data: GehaltsstufenEintragErstellen) =>
      request<GehaltsstufenEintrag>("/api/gehaltstabelle", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<Pick<GehaltsstufenEintragErstellen, "gruppe" | "stufe" | "gehaltAt" | "gueltigAb" | "bemerkung">>) =>
      request<GehaltsstufenEintrag>(`/api/gehaltstabelle/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    loeschen: (id: string) => request<{ ok: boolean }>(`/api/gehaltstabelle/${id}`, { method: "DELETE" }),
    // Bewusst kein Daten-Export – nur die leere Kopfzeile fürs CSV-Import-Format
    vorlageUrl: () => `${BASE}/api/gehaltstabelle/vorlage`,
    import: (datei: File, dryRun: boolean) => {
      const formData = new FormData();
      formData.append("file", datei);
      return request<GehaltstabelleImportZusammenfassung>(
        `/api/gehaltstabelle/import?dryRun=${dryRun ? "true" : "false"}`,
        { method: "POST", body: formData }
      );
    },
    alleLoeschen: () =>
      request<{ ok: boolean; geloescht: { eintraege: number; mitarbeiter: number; abteilungen: number } }>(
        "/api/gehaltstabelle/alle", { method: "DELETE" }
      ),
    eintraegeLoeschen: () =>
      request<{ ok: boolean; geloescht: { eintraege: number } }>(
        "/api/gehaltstabelle/eintraege", { method: "DELETE" }
      ),
  },

  zeitmodell: {
    liste: (params: { mitarbeiterId?: string; abteilungId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.mitarbeiterId) q.set("mitarbeiterId", params.mitarbeiterId);
      if (params.abteilungId)   q.set("abteilungId",   params.abteilungId);
      return request<ZeitmodellEintrag[]>(`/api/zeitmodell?${q.toString()}`);
    },
    laufenBaldAb: (tage = 30) => request<ZeitmodellEintrag[]>(`/api/zeitmodell/laufen-bald-ab?tage=${tage}`),
    erstellen: (data: ZeitmodellEintragErstellen) =>
      request<ZeitmodellEintrag>("/api/zeitmodell", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<Pick<ZeitmodellEintragErstellen, "zeitmodell" | "gueltigVon" | "gueltigBis" | "bemerkung">>) =>
      request<ZeitmodellEintrag>(`/api/zeitmodell/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    loeschen: (id: string) => request<{ ok: boolean }>(`/api/zeitmodell/${id}`, { method: "DELETE" }),
  },

  ueberstunden: {
    liste: (params: { mitarbeiterId?: string; abteilungId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.mitarbeiterId) q.set("mitarbeiterId", params.mitarbeiterId);
      if (params.abteilungId)   q.set("abteilungId",   params.abteilungId);
      return request<UeberstundenEintrag[]>(`/api/ueberstunden?${q.toString()}`);
    },
    laufenBaldAb: (tage = 30) => request<UeberstundenEintrag[]>(`/api/ueberstunden/laufen-bald-ab?tage=${tage}`),
    erstellen: (data: UeberstundenEintragErstellen) =>
      request<UeberstundenEintrag>("/api/ueberstunden", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<Pick<UeberstundenEintragErstellen, "regelung" | "gueltigVon" | "gueltigBis" | "bemerkung">>) =>
      request<UeberstundenEintrag>(`/api/ueberstunden/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    loeschen: (id: string) => request<{ ok: boolean }>(`/api/ueberstunden/${id}`, { method: "DELETE" }),
  },

  betriebsvereinbarungen: {
    liste: (params: { status?: string; von?: string; bis?: string; q?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.status) q.set("status", params.status);
      if (params.von)    q.set("von",    params.von);
      if (params.bis)    q.set("bis",    params.bis);
      if (params.q)      q.set("q",      params.q);
      return request<Betriebsvereinbarung[]>(`/api/betriebsvereinbarungen?${q.toString()}`);
    },
    erstellen: (data: BetriebsvereinbarungErstellen) =>
      request<Betriebsvereinbarung>("/api/betriebsvereinbarungen", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<BetriebsvereinbarungErstellen>) =>
      request<Betriebsvereinbarung>(`/api/betriebsvereinbarungen/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    loeschen: (id: string) => request<{ ok: boolean }>(`/api/betriebsvereinbarungen/${id}`, { method: "DELETE" }),
  },

  qualifikationen: {
    liste: () => request<Qualifikation[]>("/api/qualifikationen"),
    erstellen: (data: { name: string; beschreibung?: string; gueltigkeitsdauerMonate?: number | null }) =>
      request<Qualifikation>("/api/qualifikationen", { method: "POST", body: JSON.stringify(data) }),
  },

  schulungen: {
    liste: (params: { qualifikationId?: string; status?: string; von?: string; bis?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.qualifikationId) q.set("qualifikationId", params.qualifikationId);
      if (params.status)          q.set("status",          params.status);
      if (params.von)             q.set("von",             params.von);
      if (params.bis)             q.set("bis",             params.bis);
      return request<Schulungstermin[]>(`/api/schulungen?${q.toString()}`);
    },
    matrix: () => request<QualifikationsMatrix>("/api/schulungen/matrix"),
    erstellen: (data: SchulungsterminErstellen) =>
      request<Schulungstermin>("/api/schulungen", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<Omit<SchulungsterminErstellen, "teilnehmerIds">>) =>
      request<Schulungstermin>(`/api/schulungen/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    loeschen: (id: string) => request<{ ok: boolean }>(`/api/schulungen/${id}`, { method: "DELETE" }),
    teilnehmerHinzufuegen: (id: string, mitarbeiterId: string, teilgenommen?: boolean) =>
      request<Schulungstermin>(`/api/schulungen/${id}/teilnehmer`, { method: "POST", body: JSON.stringify({ mitarbeiterId, teilgenommen }) }),
    teilnahmeAendern: (id: string, mitarbeiterId: string, teilgenommen: boolean) =>
      request<Schulungstermin>(`/api/schulungen/${id}/teilnehmer/${mitarbeiterId}`, { method: "PATCH", body: JSON.stringify({ teilgenommen }) }),
    teilnehmerEntfernen: (id: string, mitarbeiterId: string) =>
      request<Schulungstermin>(`/api/schulungen/${id}/teilnehmer/${mitarbeiterId}`, { method: "DELETE" }),
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
    module: () => request<Record<ModuleKey, boolean>>("/api/einstellungen/module"),
    moduleSpeichern: (data: Partial<Record<ModuleKey, boolean>>) =>
      request<{ ok: boolean }>("/api/einstellungen/module", { method: "PUT", body: JSON.stringify(data) }),
    sicherheit: () => request<{ inaktivitaetMinuten: number }>("/api/einstellungen/sicherheit"),
    sicherheitSpeichern: (inaktivitaetMinuten: number) =>
      request<{ ok: boolean; inaktivitaetMinuten: number }>("/api/einstellungen/sicherheit", { method: "PUT", body: JSON.stringify({ inaktivitaetMinuten }) }),
    backups: () => request<{
      pfadLesbar: boolean;
      anzahl: number;
      saetze: { zeitpunkt: string; groesseBytes: number; vollstaendig: boolean }[];
    }>("/api/einstellungen/backups"),
    adminZugriff: () => request<{ inhaltszugriff: boolean }>("/api/einstellungen/admin-zugriff"),
    adminZugriffSpeichern: (inhaltszugriff: boolean) =>
      request<{ inhaltszugriff: boolean }>("/api/einstellungen/admin-zugriff", { method: "PUT", body: JSON.stringify({ inhaltszugriff }) }),
    wahlquote: () => request<{ minderheitengeschlecht: Geschlecht | null; mindestsitzeMinderheit: number }>("/api/einstellungen/wahlquote"),
    wahlquoteSpeichern: (data: { minderheitengeschlecht: Geschlecht | null; mindestsitzeMinderheit: number }) =>
      request<{ ok: boolean }>("/api/einstellungen/wahlquote", { method: "PUT", body: JSON.stringify(data) }),
    mail: () => request<{ absenderName: string; absenderAdresse: string; standard: string; smtpAktiv: boolean }>("/api/einstellungen/mail"),
    mailSpeichern: (data: { absenderName: string; absenderAdresse: string }) =>
      request<{ absenderName: string; absenderAdresse: string }>("/api/einstellungen/mail", { method: "PUT", body: JSON.stringify(data) }),
  },

  wahlen: {
    liste:         () => request<Wahl[]>("/api/wahlen"),
    erstellen:     (data: WahlEingabe & { mitVorhaben?: boolean }) =>
      request<Wahl>("/api/wahlen", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: Partial<WahlEingabe & { dualStudierendeAlsAzubis: boolean; ausgeschlossen: string[] }>) =>
      request<Wahl>(`/api/wahlen/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    loeschen:      (id: string) => request<{ ok: boolean }>(`/api/wahlen/${id}`, { method: "DELETE" }),
    waehlerliste:  (id: string) => request<Waehlerliste>(`/api/wahlen/${id}/waehlerliste`),
    waehlerlistePdfUrl: (id: string) => `${BASE}/api/wahlen/${id}/waehlerliste.pdf`,
    waehlerlisteCsvUrl: (id: string) => `${BASE}/api/wahlen/${id}/waehlerliste.csv`,
    ergebnisVorschau: (id: string, data: ErgebnisEingabe) =>
      request<ErgebnisPlan>(`/api/wahlen/${id}/ergebnis?vorschau=true`, { method: "POST", body: JSON.stringify(data) }),
    ergebnisUebernehmen: (id: string, data: ErgebnisEingabe) =>
      request<{ plan: ErgebnisPlan; wahl: Wahl }>(`/api/wahlen/${id}/ergebnis?vorschau=false`, { method: "POST", body: JSON.stringify(data) }),
  },

  fristen: {
    liste: (params: { von?: string; bis?: string; status?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.von)    q.set("von",    params.von);
      if (params.bis)    q.set("bis",    params.bis);
      if (params.status) q.set("status", params.status);
      return request<FristMitDokument[]>(`/api/fristen?${q}`);
    },
    erinnerungTesten: () => request<{
      fristenAnzahl: number;
      empfaengerAnzahl: number;
      gesendetAn: string[];
      fehlgeschlagenAn: { email: string; fehler: string }[];
    }>("/api/fristen/erinnerung-testen", { method: "POST" }),
    erstellen: (data: { bezeichnung?: string; faelligAm: string; typ?: string; dokumentId?: string; notiz?: string }) =>
      request<FristMitDokument>("/api/fristen", { method: "POST", body: JSON.stringify(data) }),
    aktualisieren: (id: string, data: { bezeichnung?: string; faelligAm?: string; notiz?: string; erledigt?: boolean }) =>
      request<FristMitDokument>(`/api/fristen/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    loeschen: (id: string) => request<{ ok: boolean }>(`/api/fristen/${id}`, { method: "DELETE" }),
  },

  ablauf: {
    testen: () => request<{
      eintraegeAnzahl: number;
      empfaengerAnzahl: number;
      gesendetAn: string[];
      fehlgeschlagenAn: { email: string; fehler: string }[];
    }>("/api/ablauf/testen", { method: "POST" }),
  },

  kummerkasten: {
    // Öffentlich, kein Login nötig – wird von der Public-Seite genutzt
    einreichen: (data: { nachricht: string; absenderName?: string; webseite?: string }) =>
      request<{ ok: boolean }>("/api/kummerkasten", { method: "POST", body: JSON.stringify(data) }),
    liste: () => request<KummerkastenEintrag[]>("/api/kummerkasten"),
    aktualisieren: (id: string, data: Partial<{ status: KummerkastenStatus; notiz: string | null }>) =>
      request<KummerkastenEintrag>(`/api/kummerkasten/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    loeschen: (id: string) => request<{ ok: boolean }>(`/api/kummerkasten/${id}`, { method: "DELETE" }),
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
  unterschrift_ort:     string; // Ort vor dem Datum an den Unterschriftslinien, leer = nur Datum
  kopfzeile_layout:     string; // "logo_links" | "logo_rechts" | "balken"
  fusszeile_layout:     string; // "text_links" | "text_rechts"
  hat_logo:             string; // "true" | "false"
}

export type Rolle = "VORSITZ" | "STELLVERTRETER" | "MITGLIED" | "ERSATZMITGLIED" | "ADMIN" | "JAV";
export type Prioritaet = "HOCH" | "MITTEL" | "NIEDRIG";
export type Sichtbarkeit = "PRIVAT" | "OEFFENTLICH";
export type AufgabeTyp = "PROJEKT" | "AUFGABE";
export type KanbanStatus = "BACKLOG" | "IN_BEARBEITUNG" | "ERLEDIGT";
export type AufgabenStatus = "NEU" | "IN_BEARBEITUNG" | "AUF_HOLD" | "ERLEDIGT";
export type KummerkastenStatus = "NEU" | "IN_BEARBEITUNG" | "ERLEDIGT";

export interface KummerkastenEintrag {
  id: string;
  nachricht: string;
  absenderName?: string | null;
  status: KummerkastenStatus;
  notiz?: string | null;
  bearbeitetVon?: { id: string; name: string } | null;
  bearbeitetAm?: string | null;
  erstelltAm: string;
}

export interface Aufgabe {
  id: string;
  titel: string;
  beschreibung?: string;
  beschreibungJson?: object | null;
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
  kanbanStatus?: KanbanStatus | null;
  aufgabenStatus?: AufgabenStatus;
  topId?: string | null;
  top?: { id: string; nummer: number; titel: string; sitzung: { id: string; titel: string } } | null;
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface AufgabeErstellen {
  titel: string;
  beschreibung?: string;
  beschreibungJson?: object | null;
  typ?: AufgabeTyp;
  prioritaet?: Prioritaet;
  startDatum?: string;
  endDatum?: string;
  faelligAm?: string;
  farbe?: string;
  zugewiesenAnId?: string;
  sichtbarkeit?: Sichtbarkeit;
  oberProjektId?: string;
  aufgabenStatus?: AufgabenStatus;
  kanbanStatus?: KanbanStatus;
  topId?: string;
}

export type Geschlecht = "MAENNLICH" | "WEIBLICH";

export interface Benutzer {
  id: string; name: string; email: string; rolle: Rolle;
  aktiv: boolean; letzterLogin?: string; istVertretungFuer?: string;
  geschlecht?: Geschlecht | null; wahlReihenfolge?: number | null;
  ohneInhaltszugriff?: boolean;   // nur aus /api/auth/me: Admin ohne Zugriff auf Inhalte
  einladungEmail?: string | null; // Zweitadresse für Einladungen, leer = Hauptadresse
}

export type Kategorie =
  | "ANHOERUNG_99" | "ANHOERUNG_102" | "ABMAHNUNG"
  | "BEWERBUNG" | "BEWERBUNG_ALTERNATIV"
  | "ZEITMODELL_87"
  | "BETRIEBSVEREINBARUNG" | "ARBEITGEBER_INFO" | "ARBEITSSCHUTZ" | "SCHRIFTVERKEHR"
  | "PROTOKOLL" | "SONSTIGES";

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
  // In welchen Sitzungen/TOPs behandelt (nur in der Dokumentliste)
  topVerknuepfungen?: { top: { nummer: number; titel: string; sitzung: { id: string; titel: string; sitzungsdatum: string } } }[];
}

// ── Wahlen (Backend: routes/wahlen.ts, Fristen: lib/wahlFristen.ts) ──
export type WahlArt = "BR" | "JAV";
export type WahlVerfahren = "NORMAL" | "VEREINFACHT";

export const WAHL_ART_LABEL: Record<WahlArt, string> = { BR: "Betriebsratswahl", JAV: "JAV-Wahl" };
export const WAHL_VERFAHREN_LABEL: Record<WahlVerfahren, string> = { NORMAL: "Normales Verfahren", VEREINFACHT: "Vereinfachtes Verfahren" };

export interface WahlEingabe {
  titel?: string;
  art: WahlArt;
  verfahren: WahlVerfahren;
  stimmabgabeAm: string;
  amtszeitEnde?: string | null;
  ausschreibenAm?: string | null;
  notiz?: string | null;
}

export interface Wahl {
  id: string;
  titel: string;
  art: WahlArt;
  verfahren: WahlVerfahren;
  stimmabgabeAm: string;
  amtszeitEnde?: string | null;
  ausschreibenAm?: string | null;
  notiz?: string | null;
  vorhabenId?: string | null;
  dualStudierendeAlsAzubis: boolean;
  ausgeschlossen: string[];
  ergebnis?: ErgebnisEintrag[] | null;
  ergebnisUebernommenAm?: string | null;
  konstituierendeSitzungId?: string | null;
  fristen: (Omit<FristMitDokument, "dokument"> & { wahlSchritt?: string | null })[];
  erstelltAm: string;
}

// ── Wahlergebnis übernehmen (Backend: lib/wahlErgebnis.ts) ──
export type Gewaehlt = "MITGLIED" | "ERSATZ";

export interface ErgebnisEintrag {
  rang: number;
  name: string;
  gewaehlt: Gewaehlt;
  stimmen: number | null;
  geschlecht: Geschlecht | null;
  benutzerId: string | null;
}

export interface ErgebnisEingabe {
  zeilen: { name: string; gewaehlt: Gewaehlt; stimmen?: number | null; email?: string | null; geschlecht?: Geschlecht | null }[];
  nichtGewaehlteDeaktivieren: boolean;
  quoteUebernehmen: boolean;
  konstituierendeSitzungAm?: string | null;
}

export interface ErgebnisPlan {
  zeilen: (ErgebnisEintrag & {
    aktion: "AKTUALISIEREN" | "NEU" | "NUR_ERGEBNIS" | "FEHLER";
    alteRolle: Rolle | null;
    neueRolle: Rolle | null;
    fehler?: string;
  })[];
  deaktivieren: { id: string; name: string; rolle: Rolle }[];
  wahlrangWeg: { id: string; name: string }[];
  quote: { geschlecht: Geschlecht; mindestsitze: number } | null;
  warnungen: string[];
  fehlerfrei: boolean;
}

export interface WaehlerEintrag {
  id: string;
  nachname: string;
  vorname: string;
  geburtsdatum?: string | null;
  geschlecht?: Geschlecht | null;
  abteilung?: string | null;
  beschaeftigungsart: Beschaeftigungsart;
  wahlberechtigt: boolean;
  waehlbar: boolean;
  hinweise: string[];
}

// Vorschlag aus den Mitarbeiterdaten (Backend: lib/waehlerliste.ts)
export interface Waehlerliste {
  stichtag: string;
  waehler: WaehlerEintrag[];
  pruefen: WaehlerEintrag[];
  ausgeschlossen: WaehlerEintrag[];
  anzahl: { gesamt: number; weiblich: number; maennlich: number; ohneAngabe: number };
  belegschaft: number;
  groesse: { sitze: number; grundlage: string };
  minderheit: { geschlecht: Geschlecht; mindestsitze: number; frauen: number; maenner: number; losentscheid: boolean } | null;
  verfahren: { empfehlung: WahlVerfahren; pflicht: boolean; text: string };
  dualNichtGezaehlt: number;
}

export interface FristMitDokument {
  id: string;
  typ: string;
  status: string;
  faelligAm: string;
  bezeichnung?: string | null;
  notiz?: string | null;
  erledigtAm?: string | null;
  erledigtVon?: { name: string } | null;
  erstelltAm: string;
  // null = Frist ohne Dokument (z. B. Wahl, Betriebsversammlung, manuell angelegt)
  dokument: { id: string; titel: string; alias?: string; kategorie: Kategorie; aktenzeichen?: string } | null;
}

export const FRIST_TYP_LABEL: Record<string, string> = {
  ANHOERUNG_99_WOCHE:             "Anhörung § 99 (1 Woche)",
  ANHOERUNG_102_ORDENTLICH:       "Anhörung § 102 ordentlich (1 Woche)",
  ANHOERUNG_102_AUSSERORDENTLICH: "Anhörung § 102 außerordentlich (3 Tage)",
  ZEITMODELL_87_WOCHE:            "Mitbestimmung § 87 (1 Woche)",
  BETRIEBSVERSAMMLUNG_43:         "Betriebsversammlung § 43 (Quartal)",
  WAHL:                           "Wahl (BR/JAV)",
  WIDERSPRUCH:                    "Widerspruch § 99/102 (1 Woche)",
  BENUTZERDEFINIERT:              "Individuelle Frist",
};

/** Anzeigename einer Frist: eigene Bezeichnung, sonst Dokumenttitel, sonst Fristtyp. */
export function fristTitel(f: Pick<FristMitDokument, "typ" | "bezeichnung" | "dokument">): string {
  return f.bezeichnung?.trim()
    || (f.dokument ? (f.dokument.alias ?? f.dokument.titel) : "")
    || (FRIST_TYP_LABEL[f.typ] ?? f.typ);
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
  dokument: { id: string; titel: string; alias?: string; kategorie: Kategorie; dateiname: string; aktenzeichen?: string };
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
  vertraulich: boolean;
  dokumente: TopDokumentInfo[];
  _count?: { kommentare: number };
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

// Sitzungsarten (Backend: lib/sitzungstypen.ts)
export const SITZUNGSTYP_LABEL: Record<string, string> = {
  ORDENTLICH:          "Ordentliche Sitzung",
  AUSSERORDENTLICH:    "Außerordentliche Sitzung",
  KONSTITUIEREND:      "Konstituierende Sitzung",
  BETRIEBSVERSAMMLUNG: "Betriebsversammlung",
};

/** Betriebsversammlung: Teilnehmerzahl statt Anwesenheitsliste, keine Beschlüsse, „Niederschrift“ statt „Protokoll“. */
export function istBetriebsversammlung(sitzungstyp: string | null | undefined): boolean {
  return sitzungstyp === "BETRIEBSVERSAMMLUNG";
}

export interface Sitzung {
  id: string;
  titel: string;
  sitzungsdatum: string;
  ort?: string;
  sitzungstyp: string;
  status: SitzungStatus;
  notizen?: string;
  teilnehmerzahl?: number | null;
  erstelltVon?: { id: string; name: string };
  versionen: SitzungVersion[];
  tops: TOP[];
  erstelltAm: string;
  aktualisiertAm: string;
}

// ── Einladung per E-Mail (Backend: routes/einladung.ts) ──
export interface EinladungStand {
  empfaenger: {
    benutzerId: string; name: string; rolle: string; adresse: string; ersatzFuer: string | null;
    letzterVersand: { versendetAm: string; erfolgreich: boolean; fehler: string | null; adresse: string } | null;
  }[];
  protokoll: {
    id: string; name: string; adresse: string; rolle: string; vertretungFuer: string | null;
    mitAnhang: boolean; erfolgreich: boolean; fehler: string | null; versendetAm: string; versendetVon: string;
  }[];
  smtpAktiv: boolean;
  kannVersenden: boolean;
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
  dokumentAnzahl: number;   // verknüpfte Dokumente über alle TOPs (jedes einmal)
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
  inhaltJson?: object | null;
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
  aufgaben?:  { id: string; titel: string; prioritaet: Prioritaet; erledigt: boolean; faelligAm?: string; typ: AufgabeTyp; oberProjektId?: string; kanbanStatus?: KanbanStatus | null }[];
  wissen?:    { id: string; titel: string; kategorien: string[]; erstelltAm: string }[];
  ressourcen?: { id: string; titel: string; url: string; kategorie: RessourceKategorie; erstelltAm: string }[];
  betriebsvereinbarungen?: { id: string; titel: string; status: BVStatus; abschlussdatum: string }[];
  schulungen?: { id: string; titel?: string | null; datum: string; status: SchulungsStatus; qualifikation: { name: string } }[];
  mitarbeiter?: { id: string; vorname: string; nachname: string; pnr?: string | null; abteilung?: { name: string } | null }[];
  gesetze?:    { id: string; gesetz: string; paragraph: string; titel?: string | null; text: string }[];
}

export interface GesetzParagraph {
  id: string;
  gesetzSlug: string;
  gesetz: string;
  paragraph: string;
  titel?: string | null;
  text: string;
  quelleUrl: string;
  aktualisiertAm: string;
}

export interface GesetzStatus {
  slug: string;
  name: string;
  anzahl: number;
  aktualisiertAm: string | null;
}

export interface GesetzAktualisierenErgebnis {
  slug: string;
  name: string;
  anzahl: number;
  neu: string[];
  geaendert: string[];
  istErstimport: boolean;
  fehler?: string;
}

export const SITZUNG_STATUS_LABEL: Record<SitzungStatus, string> = {
  ENTWURF:              "Entwurf",
  TAGESORDNUNG_FIXIERT: "Tagesordnung fixiert",
  PROTOKOLL_ENTWURF:    "Protokoll in Bearbeitung",
  PROTOKOLL_FINAL:      "Protokoll final",
  ABGESAGT:             "Abgesagt",
};

// Betriebsversammlung: Einladung statt Tagesordnung, Niederschrift statt Protokoll
const SITZUNG_STATUS_LABEL_BV: Record<SitzungStatus, string> = {
  ...SITZUNG_STATUS_LABEL,
  TAGESORDNUNG_FIXIERT: "Einladung fixiert",
  PROTOKOLL_ENTWURF:    "Niederschrift in Bearbeitung",
  PROTOKOLL_FINAL:      "Niederschrift final",
};

export function sitzungStatusLabel(status: SitzungStatus, sitzungstyp?: string | null): string {
  return (istBetriebsversammlung(sitzungstyp) ? SITZUNG_STATUS_LABEL_BV : SITZUNG_STATUS_LABEL)[status];
}

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
  inhaltJson?: object | null;
  herkunft: string;
  quelle?: { sitzungId?: string; topId?: string; protocolBlockId?: string } | null;
  kategorien: string[];
  loesung?: string | null;
  loesungJson?: object | null;
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
  | "BENUTZER_ERSTELLT" | "BENUTZER_DEAKTIVIERT" | "BENUTZER_GELOESCHT"
  | "SITZUNG_ERSTELLT" | "SITZUNG_AKTUALISIERT" | "SITZUNG_FIXIERT"
  | "SITZUNG_PROTOKOLL_GESTARTET" | "SITZUNG_FINALISIERT" | "SITZUNG_GELOESCHT"
  | "ABSTIMMUNG_ERSTELLT" | "ABSTIMMUNG_FINALISIERT"
  | "NACHRICHT_GESENDET" | "WATCHFOLDER_FEHLER"
  | "WISSEN_ERSTELLT" | "WISSEN_AKTUALISIERT" | "WISSEN_GELOESCHT"
  | "EINSTELLUNG_GEAENDERT";

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
  BENUTZER_GELOESCHT:          "Benutzer endgültig gelöscht",
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
  EINSTELLUNG_GEAENDERT:       "Einstellung geändert",
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

export interface Abteilung {
  id: string;
  name: string;
  erstelltAm: string;
  aktualisiertAm: string;
}

export type Beschaeftigungsart = "MITARBEITER" | "AZUBI" | "STUDENT" | "DUALER_STUDENT" | "ZEITARBEITER";

// STUDENT = studentische Hilfskraft (stundenweise), DUALER_STUDENT = duales Studium
// (weder Azubi noch studentische Hilfskraft) – bewusst zwei getrennte Kategorien.
export const BESCHAEFTIGUNGSART_LABEL: Record<Beschaeftigungsart, string> = {
  MITARBEITER:    "Mitarbeiter",
  AZUBI:          "Azubi",
  STUDENT:        "Studentische Hilfskraft",
  DUALER_STUDENT: "Dualer Student",
  ZEITARBEITER:   "Zeitarbeiter",
};

// Kurzform fürs Badge (Mitarbeiter bekommt bewusst keins, siehe Anzeige-Stellen)
export const BESCHAEFTIGUNGSART_KUERZEL: Record<Beschaeftigungsart, string> = {
  MITARBEITER:    "",
  AZUBI:          "AZUBI",
  STUDENT:        "SHK",
  DUALER_STUDENT: "DUAL",
  ZEITARBEITER:   "ZA",
};

// Feste kategoriale Reihenfolge/Farben – konsistent über Badge, Stat-Karten und Standort-Diagramm.
// MITARBEITER als Basisfarbe grau (häufigste/Standard-Kategorie), danach fest zugeordnet, nicht rotierend.
export const BESCHAEFTIGUNGSART_FARBE: Record<Beschaeftigungsart, { badge: string; balken: string }> = {
  MITARBEITER:    { badge: "bg-gray-100 text-gray-600",   balken: "bg-gray-400" },
  AZUBI:          { badge: "bg-blue-100 text-blue-700",   balken: "bg-blue-500" },
  STUDENT:        { badge: "bg-violet-100 text-violet-700", balken: "bg-violet-500" },
  DUALER_STUDENT: { badge: "bg-teal-100 text-teal-700",   balken: "bg-teal-500" },
  ZEITARBEITER:   { badge: "bg-amber-100 text-amber-700", balken: "bg-amber-500" },
};

export const ALLE_BESCHAEFTIGUNGSARTEN: Beschaeftigungsart[] = ["MITARBEITER", "AZUBI", "STUDENT", "DUALER_STUDENT", "ZEITARBEITER"];

export interface Mitarbeiter {
  id: string;
  vorname: string;
  nachname: string;
  pnr?: string | null;
  eintritt?: string | null;
  austritt?: string | null;
  standort?: string | null;
  geburtsdatum?: string | null;
  geschlecht?: Geschlecht | null;
  abteilungId?: string | null;
  abteilung?: { id: string; name: string } | null;
  gehaltIgnorieren?: boolean;
  beschaeftigungsart?: Beschaeftigungsart;
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface MitarbeiterImportZusammenfassung {
  neueAbteilungen: string[];
  neueMitarbeiter: { pnr: string | null; name: string }[];
  bereitsVorhanden: { pnr: string | null; name: string }[];
  geaendert: { zeile: number; grund: string }[];
  uebersprungen: { zeile: number; grund: string }[];
  fehler: { zeile: number; grund: string }[];
}

export interface GehaltstabelleImportZusammenfassung {
  neueAbteilungen: string[];
  neueMitarbeiter: { pnr: string | null; name: string }[];
  neueEintraege: number;
  geaendert: { zeile: number; grund: string }[];
  uebersprungen: { zeile: number; grund: string }[];
  fehler: { zeile: number; grund: string }[];
}

export interface GehaltsstufenEintrag {
  id: string;
  mitarbeiterId: string;
  gruppe: number | null;
  stufe: number | null;
  // AT ("außer Tarif") – reales Gehalt statt Gruppe/Stufe. Kommt vom Server als
  // String (Decimal-Serialisierung), nie zusammen mit gruppe/stufe gesetzt.
  gehaltAt: string | null;
  gueltigAb: string;
  bemerkung?: string | null;
  sitzungId?: string | null;
  sitzung?: { id: string; titel: string; sitzungsdatum: string } | null;
  mitarbeiter: {
    id: string;
    vorname: string;
    nachname: string;
    pnr?: string | null;
    eintritt?: string | null;
    austritt?: string | null;
    standort?: string | null;
    abteilung?: { id: string; name: string } | null;
    beschaeftigungsart?: Beschaeftigungsart;
  };
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface GehaltsstufenEintragErstellen {
  mitarbeiterId: string;
  // Entweder Gruppe+Stufe (tariflich) ODER gehaltAt (AT/außer Tarif), nie beides.
  gruppe?: number;
  stufe?: number;
  gehaltAt?: number;
  gueltigAb: string;
  bemerkung?: string;
  sitzungId?: string;
}

export type Zeitmodell = "A" | "B" | "C" | "D";

export interface ZeitmodellEintrag {
  id: string;
  mitarbeiterId: string;
  zeitmodell: Zeitmodell;
  gueltigVon: string;
  gueltigBis?: string | null;
  bemerkung?: string | null;
  sitzungId?: string | null;
  sitzung?: { id: string; titel: string; sitzungsdatum: string } | null;
  mitarbeiter: {
    id: string;
    vorname: string;
    nachname: string;
    pnr?: string | null;
    austritt?: string | null;
    standort?: string | null;
    abteilung?: { id: string; name: string } | null;
    beschaeftigungsart?: Beschaeftigungsart;
  };
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface ZeitmodellEintragErstellen {
  mitarbeiterId: string;
  zeitmodell: Zeitmodell;
  gueltigVon: string;
  gueltigBis?: string | null;
  bemerkung?: string;
  sitzungId?: string;
}

export interface UeberstundenEintrag {
  id: string;
  mitarbeiterId: string;
  regelung: string;
  gueltigVon: string;
  gueltigBis?: string | null;
  bemerkung?: string | null;
  sitzungId?: string | null;
  sitzung?: { id: string; titel: string; sitzungsdatum: string } | null;
  mitarbeiter: {
    id: string;
    vorname: string;
    nachname: string;
    pnr?: string | null;
    austritt?: string | null;
    standort?: string | null;
    abteilung?: { id: string; name: string } | null;
    beschaeftigungsart?: Beschaeftigungsart;
  };
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface UeberstundenEintragErstellen {
  mitarbeiterId: string;
  regelung?: string;
  gueltigVon: string;
  gueltigBis?: string | null;
  bemerkung?: string;
  sitzungId?: string;
}

export type BVStatus = "AKTIV" | "GEKUENDIGT" | "ABGELOEST" | "BEFRISTET_AUSGELAUFEN";

export interface Betriebsvereinbarung {
  id: string;
  titel: string;
  abschlussdatum: string;
  geltungsbereich?: string | null;
  status: BVStatus;
  laufzeitEnde?: string | null;
  bemerkung?: string | null;
  dokumentId?: string | null;
  dokument?: { id: string; titel: string; dateiname: string } | null;
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface BetriebsvereinbarungErstellen {
  titel: string;
  abschlussdatum: string;
  geltungsbereich?: string;
  status?: BVStatus;
  laufzeitEnde?: string | null;
  bemerkung?: string;
  dokumentId?: string | null;
}

export type SchulungsStatus = "GEPLANT" | "ABSOLVIERT" | "ABGESAGT";

export interface Qualifikation {
  id: string;
  name: string;
  beschreibung?: string | null;
  gueltigkeitsdauerMonate?: number | null;
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface SchulungsTeilnahme {
  id: string;
  mitarbeiterId: string;
  teilgenommen: boolean;
  mitarbeiter: Mitarbeiter;
}

export interface Schulungstermin {
  id: string;
  qualifikationId: string;
  qualifikation: Qualifikation;
  titel?: string | null;
  datum: string;
  ort?: string | null;
  anbieter?: string | null;
  kosten?: number | null;
  status: SchulungsStatus;
  bemerkung?: string | null;
  teilnehmer: SchulungsTeilnahme[];
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface SchulungsterminErstellen {
  qualifikationId: string;
  titel?: string;
  datum: string;
  ort?: string;
  anbieter?: string;
  kosten?: number;
  status?: SchulungsStatus;
  bemerkung?: string;
  teilnehmerIds?: string[];
}

export interface QualifikationsMatrixZelle {
  qualifikationId: string;
  absolviertAm: string | null;
  gueltigBis: string | null;
  status: "NIE" | "GUELTIG" | "ABGELAUFEN";
}

export interface QualifikationsMatrix {
  qualifikationen: Qualifikation[];
  zeilen: {
    mitarbeiter: { id: string; vorname: string; nachname: string };
    zellen: QualifikationsMatrixZelle[];
  }[];
}

export interface WissensEintragErstellen {
  titel: string;
  inhalt: string;
  inhaltJson?: object | null;
  kategorien?: string[];
  loesung?: string;
  loesungJson?: object | null;
  herkunft?: string;
  quelle?: { sitzungId?: string; topId?: string; protocolBlockId?: string };
}

// ── Module (Admin-Ein/Ausschalter) ──────────────────────────────────
export type ModuleKey = "personalverwaltung" | "betriebsvereinbarungen" | "wissensarchiv" | "ressourcen" | "themensammlung";

export const MODULE_KEYS: ModuleKey[] = [
  "personalverwaltung", "betriebsvereinbarungen", "wissensarchiv", "ressourcen", "themensammlung",
];

export const MODULE_LABEL: Record<ModuleKey, { name: string; beschreibung: string }> = {
  personalverwaltung:     { name: "Personalverwaltung",     beschreibung: "Gehaltstabelle, Mitarbeiter-Stammdaten und Schulungsverwaltung/Qualifikationsmatrix" },
  betriebsvereinbarungen: { name: "Betriebsvereinbarungen", beschreibung: "Register aller Betriebsvereinbarungen mit Status und Laufzeit" },
  wissensarchiv:          { name: "Wissensarchiv",          beschreibung: "Interne Problem-Lösungs-Sammlung, teils aus Protokollen extrahiert" },
  ressourcen:             { name: "Ressourcen",              beschreibung: "Externe Links zu Gesetzen, KI-Werkzeugen, Behörden, Vorlagen" },
  themensammlung:         { name: "Themensammlung",          beschreibung: "Auszug aus Protokollen für Öffentlichkeitsarbeit/Mitgliederinfo" },
};

// ── Hilfsfunktionen ───────────────────────────────────────────────
// Reihenfolge = Anzeigereihenfolge (gleich wie backend/src/lib/kategorien.ts)
export const KATEGORIE_LABEL: Record<Kategorie, string> = {
  ANHOERUNG_99:         "§ 99 BetrVG – Einstellung/Versetzung",
  ANHOERUNG_102:        "§ 102 BetrVG – Kündigung",
  ABMAHNUNG:            "Abmahnung",
  BEWERBUNG:            "Bewerbung",
  BEWERBUNG_ALTERNATIV: "Alternative Bewerbung (§ 99)",
  ZEITMODELL_87:        "§ 87 BetrVG – Zeitmodelländerung",
  BETRIEBSVEREINBARUNG: "Betriebsvereinbarung",
  ARBEITGEBER_INFO:     "Information des Arbeitgebers",
  ARBEITSSCHUTZ:        "Arbeits- und Gesundheitsschutz",
  SCHRIFTVERKEHR:       "Schriftverkehr",
  PROTOKOLL:            "Sitzungsprotokoll",
  SONSTIGES:            "Sonstiges",
};

// Kurzform für die Kategorie-Leiste über der Dokumentliste
export const KATEGORIE_KURZ: Record<Kategorie, string> = {
  ANHOERUNG_99:         "§ 99 Einstellung/Versetzung",
  ANHOERUNG_102:        "§ 102 Kündigung",
  ABMAHNUNG:            "Abmahnung",
  BEWERBUNG:            "Bewerbung",
  BEWERBUNG_ALTERNATIV: "Alt. Bewerbung",
  ZEITMODELL_87:        "§ 87 Zeitmodell",
  BETRIEBSVEREINBARUNG: "Betriebsvereinbarung",
  ARBEITGEBER_INFO:     "Info Arbeitgeber",
  ARBEITSSCHUTZ:        "Arbeitsschutz",
  SCHRIFTVERKEHR:       "Schriftverkehr",
  PROTOKOLL:            "Protokoll",
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
