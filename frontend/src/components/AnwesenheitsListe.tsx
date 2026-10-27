import { useEffect, useState } from "react";
import { api, Benutzer, Verfuegbarkeit, ABWESENHEITS_GRUND_LABEL, Teilnahmeart, TEILNAHMEART_LABEL } from "../lib/api";
import { CheckCircle, XCircle, HelpCircle, UserCheck, UserPlus, CalendarOff, AlertTriangle, Wand2, Video } from "lucide-react";
import { Link } from "react-router-dom";

export type AnwesenheitsStatus = "ANWESEND" | "ABWESEND_ENTSCHULDIGT" | "ABWESEND_UNENTSCHULDIGT" | "ERSATZ_FUER";

interface Anwesenheit {
  id: string;
  status: AnwesenheitsStatus;
  vertretungFuer?: { id: string; name: string } | null;
  benutzer: { id: string; name: string; rolle: string };
  teilnahmeart?: Teilnahmeart;              // § 30 Abs. 2 (Roadmap Paket 6)
  teilnahmeBestaetigtAm?: string | null;    // § 34 Abs. 1
}

interface ListItem {
  benutzer: Benutzer;
  anwesenheit: Anwesenheit | null;
}

interface ErsatzVorschlagInfo {
  vorschlag:   { id: string; name: string } | null;
  warnung:     string | null;
  alternative: { id: string; name: string } | null;
}

const ORDENTLICHE_ROLLEN = ["VORSITZ", "STELLVERTRETER", "MITGLIED"];

const STATUS_LABEL: Record<AnwesenheitsStatus, string> = {
  ANWESEND: "Anwesend",
  ABWESEND_ENTSCHULDIGT: "Abwesend (entschuldigt)",
  ABWESEND_UNENTSCHULDIGT: "Abwesend (unentschuldigt)",
  ERSATZ_FUER: "Ersatzmitglied",
};

// Vor der Sitzung geht es um die Ladung, nicht um die tatsächliche Anwesenheit
const STATUS_LABEL_VORAB: Record<AnwesenheitsStatus, string> = {
  ANWESEND: "Kommt",
  ABWESEND_ENTSCHULDIGT: "Verhindert",
  ABWESEND_UNENTSCHULDIGT: "Abwesend (unentschuldigt)",
  ERSATZ_FUER: "Als Ersatz geladen",
};

const ROLLE_LABEL: Record<string, string> = {
  VORSITZ: "Vorsitz", STELLVERTRETER: "Stellv. Vorsitz", MITGLIED: "Mitglied",
  ERSATZMITGLIED: "Ersatzmitglied", JAV: "JAV", SBV: "SBV",
};

const STATUS_ICON: Record<AnwesenheitsStatus, React.ReactNode> = {
  ANWESEND: <CheckCircle size={16} className="text-green-600" />,
  ABWESEND_ENTSCHULDIGT: <HelpCircle size={16} className="text-amber-600" />,
  ABWESEND_UNENTSCHULDIGT: <XCircle size={16} className="text-red-600" />,
  ERSATZ_FUER: <UserCheck size={16} className="text-[rgb(var(--accent))]" />,
};

interface Props {
  sitzungId: string;
  readonly?: boolean;
  // Sitzung hat noch nicht stattgefunden: Liste dient der Ladung (Verhinderung, Ersatz)
  vorSitzung?: boolean;
  // Form der Sitzung erlaubt Zuschaltung per Video/Telefon (§ 30 Abs. 2) – dann je Person die Teilnahmeart
  zuschaltung?: boolean;
  onGeaendert?: () => void;
}

export default function AnwesenheitsListe({ sitzungId, readonly = false, vorSitzung = false, zuschaltung = false, onGeaendert }: Props) {
  const label = vorSitzung ? STATUS_LABEL_VORAB : STATUS_LABEL;
  const [liste,          setListe]          = useState<ListItem[]>([]);
  const [isLaden,        setIsLaden]        = useState(true);
  const [speichern,      setSpeichern]      = useState<string | null>(null);
  // benutzerId → pending vertretungFuerId (wenn ERSATZ_FUER gewählt, aber noch nicht bestätigt)
  const [pendingErsatz,  setPendingErsatz]  = useState<Record<string, string>>({});
  // abwesenderId (ordentliches Mitglied) → Nachrück-Vorschlag laut Wahlrang
  const [vorschlaege,    setVorschlaege]    = useState<Record<string, ErsatzVorschlagInfo>>({});
  // Abwesenheitskalender am Sitzungstag (nur vor der Sitzung; JAV/SBV bekommen 403 → ohne)
  const [kalender,       setKalender]       = useState<Verfuegbarkeit | null>(null);
  const [uebernimmt,     setUebernimmt]     = useState(false);
  const [kalenderMeldung, setKalenderMeldung] = useState("");

  useEffect(() => { ladeDaten(); }, [sitzungId]);

  async function ladeDaten() {
    setIsLaden(true);
    try {
      const data = await api.get<ListItem[]>(`/api/sitzungen/${sitzungId}/anwesenheit`);
      setListe(data);
    } catch (err) {
      console.error("Fehler beim Laden:", err);
    } finally {
      setIsLaden(false);
    }
    if (vorSitzung) api.sitzungen.verfuegbarkeit(sitzungId).then(setKalender).catch(() => setKalender(null));
  }

  async function kalenderUebernehmen() {
    setUebernimmt(true); setKalenderMeldung("");
    try {
      const r = await api.sitzungen.kalenderUebernehmen(sitzungId);
      const teile = [
        r.verhindert && `${r.verhindert} verhindert`,
        r.kommt && `${r.kommt} „Kommt“`,
        r.ersatz && `${r.ersatz} Ersatz geladen`,
      ].filter(Boolean);
      setKalenderMeldung(`Übernommen: ${teile.join(", ") || "nichts zu ändern"}` +
        (r.ohneErsatz.length ? ` – kein Ersatzmitglied mehr frei für ${r.ohneErsatz.join(", ")}` : ""));
      setVorschlaege({});
      ladeDaten();
      onGeaendert?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Übernehmen");
    } finally {
      setUebernimmt(false);
    }
  }

  async function setStatus(benutzerId: string, status: AnwesenheitsStatus, vertretungFuerId?: string, teilnahmeart?: Teilnahmeart) {
    setSpeichern(benutzerId);
    try {
      await api.post(`/api/sitzungen/${sitzungId}/anwesenheit`, {
        benutzerId,
        status,
        vertretungFuerId,
        teilnahmeart,
      });
      ladeDaten();
      onGeaendert?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSpeichern(null);
    }
  }

  async function onStatusChange(item: ListItem, newStatus: AnwesenheitsStatus | "") {
    if (newStatus === "ERSATZ_FUER") {
      // Erst vertretungFuerId abfragen, dann speichern
      setPendingErsatz(prev => ({ ...prev, [item.benutzer.id]: "" }));
      return;
    }

    setPendingErsatz(prev => {
      const n = { ...prev };
      delete n[item.benutzer.id];
      return n;
    });

    if (newStatus === "") {
      await loescheEintrag(item);
      return;
    }

    await setStatus(item.benutzer.id, newStatus);

    const istAbwesendStatus = newStatus === "ABWESEND_ENTSCHULDIGT" || newStatus === "ABWESEND_UNENTSCHULDIGT";
    if (istAbwesendStatus && ORDENTLICHE_ROLLEN.includes(item.benutzer.rolle)) {
      ladeVorschlag(item.benutzer.id);
    } else {
      verwerfeVorschlag(item.benutzer.id);
    }
  }

  // "Nicht gesetzt" ausgewählt – Eintrag komplett entfernen statt nur Status zu ändern.
  // War bisher ein No-Op (keine Delete-Aktion verdrahtet), daher ließ sich ein einmal
  // gesetzter Eintrag über die UI nie wieder entfernen.
  async function loescheEintrag(item: ListItem) {
    if (!item.anwesenheit) return;
    const { id: eintragId, status, vertretungFuer } = item.anwesenheit;
    setSpeichern(item.benutzer.id);
    try {
      await api.delete(`/api/sitzungen/${sitzungId}/anwesenheit/${eintragId}`);
      ladeDaten();
      onGeaendert?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Entfernen");
    } finally {
      setSpeichern(null);
    }
    verwerfeVorschlag(item.benutzer.id);
    // War dieser Eintrag ein Ersatz für jemanden, bekommt der Abwesende seinen Vorschlag zurück.
    if (status === "ERSATZ_FUER" && vertretungFuer) {
      ladeVorschlag(vertretungFuer.id);
    }
  }

  async function ladeVorschlag(abwesenderId: string) {
    try {
      const ergebnis = await api.sitzungen.ersatzVorschlag(sitzungId, abwesenderId);
      setVorschlaege(prev => ({ ...prev, [abwesenderId]: ergebnis }));
    } catch {
      // Vorschlag ist best-effort – kein Blocker für die manuelle Zuordnung
    }
  }

  function verwerfeVorschlag(abwesenderId: string) {
    setVorschlaege(prev => {
      const n = { ...prev };
      delete n[abwesenderId];
      return n;
    });
  }

  async function ersatzBestaetigen(ersatzId: string) {
    const vertretungFuerId = pendingErsatz[ersatzId];
    if (!vertretungFuerId) return;
    setPendingErsatz(prev => {
      const n = { ...prev };
      delete n[ersatzId];
      return n;
    });
    await setStatus(ersatzId, "ERSATZ_FUER", vertretungFuerId);
    verwerfeVorschlag(vertretungFuerId);
  }

  async function vorschlagUebernehmen(abwesenderId: string, kandidatId: string) {
    await setStatus(kandidatId, "ERSATZ_FUER", abwesenderId);
    verwerfeVorschlag(abwesenderId);
  }

  const anwesend = liste.filter(l => l.anwesenheit?.status === "ANWESEND").length;
  const zugeschaltet = liste.filter(l => l.anwesenheit && l.anwesenheit.teilnahmeart && l.anwesenheit.teilnahmeart !== "VOR_ORT").length;
  const kommen   = anwesend + liste.filter(l => l.anwesenheit?.status === "ERSATZ_FUER").length;
  // verhindertes Mitglied → Name des geladenen Ersatzes
  const vertretenDurch = new Map(
    liste
      .filter(l => l.anwesenheit?.status === "ERSATZ_FUER" && l.anwesenheit.vertretungFuer)
      .map(l => [l.anwesenheit!.vertretungFuer!.id, l.benutzer.name]),
  );
  const gesamt   = liste.length;

  const kalenderVon = new Map((kalender?.mitglieder ?? []).filter(m => m.abwesend).map(m => [m.benutzerId, m]));
  const konfliktIds = new Set((kalender?.konflikte ?? []).map(k => k.id));

  // Ordentliche Mitglieder für "Vertritt:"-Dropdown
  const ordentlicheMitglieder = liste.filter(l => ORDENTLICHE_ROLLEN.includes(l.benutzer.rolle));

  if (isLaden) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400">
        <HelpCircle className="animate-pulse mr-2" size={20} /> Lade Anwesenheitsliste...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">{vorSitzung ? "Ladung & Verhinderung" : "Anwesenheit"}</h3>
          <span className="text-xs text-gray-500">
            {vorSitzung ? `${kommen} geladen` : `${anwesend} von ${gesamt} anwesend`}
          </span>
        </div>
        {vorSitzung && !readonly && (
          <p className="text-xs text-gray-500 mt-1">
            Ist ein Mitglied verhindert, auf „Verhindert“ stellen – BR-DMS schlägt das nächste Ersatzmitglied
            laut Wahlrang vor. Geladene Ersatzmitglieder stehen auf der Anwesenheitsliste mit „für …“.
          </p>
        )}
      </div>

      {vorSitzung && kalender && (
        <KalenderHinweis
          kalender={kalender}
          readonly={readonly}
          uebernimmt={uebernimmt}
          meldung={kalenderMeldung}
          onUebernehmen={kalenderUebernehmen}
        />
      )}

      <div className="divide-y divide-gray-50">
        {liste.map((item) => {
          const istAnwesend     = item.anwesenheit?.status === "ANWESEND";
          const istErsatz       = item.benutzer.rolle === "ERSATZMITGLIED";
          const hasPending      = pendingErsatz[item.benutzer.id] !== undefined;

          return (
            <div key={item.benutzer.id}>
              <div className={`px-4 py-3 flex items-center gap-3 ${istAnwesend ? "bg-green-50" : ""}`}>
                {/* Status-Icon */}
                <div className="shrink-0">
                  {item.anwesenheit ? (
                    STATUS_ICON[item.anwesenheit.status]
                  ) : (
                    <HelpCircle size={16} className="text-gray-300" />
                  )}
                </div>

                {/* Name & Rolle */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.benutzer.name}</p>
                  <p className="text-xs text-gray-400">
                    {ROLLE_LABEL[item.benutzer.rolle] ?? item.benutzer.rolle}
                    {item.anwesenheit?.status === "ERSATZ_FUER" && item.anwesenheit.vertretungFuer && (
                      <span className="ml-1 font-medium text-[rgb(var(--accent))]">für {item.anwesenheit.vertretungFuer.name}</span>
                    )}
                    {vertretenDurch.get(item.benutzer.id) && (
                      <span className="ml-1 text-[rgb(var(--accent))]">· Ersatz: {vertretenDurch.get(item.benutzer.id)}</span>
                    )}
                  </p>
                  {item.anwesenheit?.teilnahmeart && item.anwesenheit.teilnahmeart !== "VOR_ORT" && !vorSitzung && (
                    <span className={`mt-0.5 inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 border ${item.anwesenheit.teilnahmeBestaetigtAm ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>
                      <Video size={11} />
                      {item.anwesenheit.teilnahmeBestaetigtAm ? "Teilnahme bestätigt" : "Bestätigung (§ 34) offen"}
                    </span>
                  )}
                  {kalenderVon.get(item.benutzer.id) && (
                    <KalenderMarke eintrag={kalenderVon.get(item.benutzer.id)!} konflikt={konfliktIds.has(item.benutzer.id)} />
                  )}
                </div>

                {/* Status-Steuerung */}
                {!readonly && (
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Nachladen-Button für Ersatzmitglieder ohne Eintrag */}
                    {istErsatz && !item.anwesenheit && !hasPending && (
                      <button
                        onClick={() => setPendingErsatz(prev => ({ ...prev, [item.benutzer.id]: "" }))}
                        className="flex items-center gap-1 text-xs bg-accent/5 hover:bg-accent/10 text-accent border border-accent/25 px-2 py-1 rounded-lg transition-colors"
                        title="Als Ersatzmitglied nachladen"
                      >
                        <UserPlus size={12} /> {vorSitzung ? "Laden" : "Nachladen"}
                      </button>
                    )}

                    {zuschaltung && (item.anwesenheit?.status === "ANWESEND" || item.anwesenheit?.status === "ERSATZ_FUER") && (
                      <select
                        value={item.anwesenheit.teilnahmeart ?? "VOR_ORT"}
                        onChange={e => setStatus(item.benutzer.id, item.anwesenheit!.status, item.anwesenheit!.vertretungFuer?.id, e.target.value as Teilnahmeart)}
                        disabled={speichern === item.benutzer.id}
                        title="Teilnahme vor Ort oder zugeschaltet (§ 30 Abs. 2 BetrVG)"
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))] disabled:opacity-50"
                      >
                        {(Object.keys(TEILNAHMEART_LABEL) as Teilnahmeart[]).map(t => (
                          <option key={t} value={t}>{TEILNAHMEART_LABEL[t]}</option>
                        ))}
                      </select>
                    )}
                    <select
                      value={item.anwesenheit?.status ?? ""}
                      onChange={e => onStatusChange(item, e.target.value as AnwesenheitsStatus | "")}
                      disabled={speichern === item.benutzer.id || hasPending}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-hidden focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))] disabled:opacity-50"
                    >
                      <option value="">Nicht gesetzt</option>
                      <option value="ANWESEND">{label.ANWESEND}</option>
                      <option value="ABWESEND_ENTSCHULDIGT">{label.ABWESEND_ENTSCHULDIGT}</option>
                      {!vorSitzung && <option value="ABWESEND_UNENTSCHULDIGT">{label.ABWESEND_UNENTSCHULDIGT}</option>}
                      <option value="ERSATZ_FUER">{label.ERSATZ_FUER}</option>
                    </select>
                  </div>
                )}

                {readonly && item.anwesenheit && (
                  <span className="text-xs text-gray-500">
                    {label[item.anwesenheit.status]}
                    {item.anwesenheit.teilnahmeart && item.anwesenheit.teilnahmeart !== "VOR_ORT" && ` · ${TEILNAHMEART_LABEL[item.anwesenheit.teilnahmeart]}`}
                  </span>
                )}
              </div>

              {/* Inline-Picker: Für wen vertritt dieses Ersatzmitglied? */}
              {!readonly && hasPending && (
                <div className="px-4 pb-3 pt-1 bg-accent/5 border-t border-accent/15 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-accent">Vertritt:</span>
                  <select
                    value={pendingErsatz[item.benutzer.id]}
                    onChange={e =>
                      setPendingErsatz(prev => ({ ...prev, [item.benutzer.id]: e.target.value }))
                    }
                    className="border border-accent/40 rounded-lg px-2 py-1 text-xs bg-white focus:outline-hidden focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    autoFocus
                  >
                    <option value="">– Bitte wählen –</option>
                    {ordentlicheMitglieder
                      .filter(l => l.benutzer.id !== item.benutzer.id)
                      .map(l => (
                        <option key={l.benutzer.id} value={l.benutzer.id}>
                          {l.benutzer.name}
                        </option>
                      ))
                    }
                  </select>
                  <button
                    onClick={() => ersatzBestaetigen(item.benutzer.id)}
                    disabled={!pendingErsatz[item.benutzer.id] || speichern === item.benutzer.id}
                    className="text-xs bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white px-3 py-1 rounded-lg font-medium transition-colors"
                  >
                    Bestätigen
                  </button>
                  <button
                    onClick={() =>
                      setPendingErsatz(prev => {
                        const n = { ...prev };
                        delete n[item.benutzer.id];
                        return n;
                      })
                    }
                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
                  >
                    Abbrechen
                  </button>
                </div>
              )}

              {/* Nachrück-Vorschlag laut Wahlrang, nachdem dieses Mitglied als abwesend gemeldet wurde */}
              {!readonly && !hasPending && vorschlaege[item.benutzer.id] && (
                <ErsatzVorschlagBanner
                  info={vorschlaege[item.benutzer.id]}
                  onUebernehmen={kandidatId => vorschlagUebernehmen(item.benutzer.id, kandidatId)}
                  onSchliessen={() => verwerfeVorschlag(item.benutzer.id)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Zusammenfassung */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
        <div className="flex gap-4 flex-wrap">
          <span className="flex items-center gap-1">
            <CheckCircle size={12} className="text-green-600" />
            Anwesend: {anwesend}
          </span>
          <span className="flex items-center gap-1">
            <HelpCircle size={12} className="text-amber-600" />
            Entschuldigt: {liste.filter(l => l.anwesenheit?.status === "ABWESEND_ENTSCHULDIGT").length}
          </span>
          <span className="flex items-center gap-1">
            <XCircle size={12} className="text-red-600" />
            Unentschuldigt: {liste.filter(l => l.anwesenheit?.status === "ABWESEND_UNENTSCHULDIGT").length}
          </span>
          <span className="flex items-center gap-1">
            <UserCheck size={12} className="text-[rgb(var(--accent))]" />
            Ersatz: {liste.filter(l => l.anwesenheit?.status === "ERSATZ_FUER").length}
          </span>
          {zugeschaltet > 0 && (
            <span className="flex items-center gap-1" title="Zählen nach § 33 Abs. 1 BetrVG als anwesend">
              <Video size={12} className="text-[rgb(var(--accent))]" />
              Zugeschaltet: {zugeschaltet}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Nachrück-Vorschlag-Banner (laut Wahlrang, mit optionaler Quoten-Warnung) ──
function ErsatzVorschlagBanner({
  info, onUebernehmen, onSchliessen,
}: {
  info: ErsatzVorschlagInfo;
  onUebernehmen: (kandidatId: string) => void;
  onSchliessen: () => void;
}) {
  const { vorschlag, warnung, alternative } = info;
  if (!vorschlag) return null;

  return (
    <div className="px-4 pb-3 pt-1 bg-accent/5 border-t border-accent/15 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <UserPlus size={13} className="text-accent shrink-0" />
        <span className="text-xs text-accent">
          Vorschlag laut Wahlrang: <span className="font-semibold">{vorschlag.name}</span> nachladen
        </span>
        <button
          onClick={() => onUebernehmen(vorschlag.id)}
          className="text-xs bg-accent hover:brightness-90 text-white px-3 py-1 rounded-lg font-medium transition-colors"
        >
          Übernehmen
        </button>
        <button onClick={onSchliessen} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">
          Ausblenden
        </button>
      </div>

      {warnung && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span className="text-xs text-amber-800 flex-1">{warnung}</span>
          {alternative && (
            <button
              onClick={() => onUebernehmen(alternative.id)}
              className="text-xs bg-amber-600 hover:brightness-90 text-white px-2 py-1 rounded-lg font-medium shrink-0 whitespace-nowrap"
            >
              „{alternative.name}“ stattdessen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Abwesenheitskalender: Marke je Person und Zusammenfassung über der Liste ──
const bisText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : "";

function KalenderMarke({ eintrag, konflikt }: { eintrag: Verfuegbarkeit["mitglieder"][number]; konflikt: boolean }) {
  const grund = eintrag.grund ? ABWESENHEITS_GRUND_LABEL[eintrag.grund] : "abwesend";
  return (
    <span className={`mt-0.5 inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 ${konflikt ? "bg-red-50 text-red-700 border border-red-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
      {konflikt ? <AlertTriangle size={11} /> : <CalendarOff size={11} />}
      Laut Kalender {grund}{eintrag.bis && ` bis ${bisText(eintrag.bis)}`}{konflikt && " – trotzdem geladen"}
    </span>
  );
}

function KalenderHinweis({ kalender, readonly, uebernimmt, meldung, onUebernehmen }: {
  kalender: Verfuegbarkeit; readonly: boolean; uebernimmt: boolean; meldung: string; onUebernehmen: () => void;
}) {
  const abwesend = kalender.mitglieder.filter(m => m.abwesend);
  const p = kalender.prognose;
  const mitVorschlag = kalender.ersatzPlan.filter(e => e.ersatz);
  const ohneErsatz = kalender.ersatzPlan.filter(e => !e.ersatz);
  const tag = new Date(`${kalender.tag}T00:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-white space-y-2 text-xs">
      <div className="flex items-start gap-2 flex-wrap">
        <CalendarOff size={14} className="text-gray-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 text-gray-700">
          <span className="font-medium">Abwesenheitskalender {tag}: </span>
          {abwesend.length === 0
            ? "niemand eingetragen."
            : <>{abwesend.length} abwesend – {abwesend.map(m => m.name).join(", ")}.</>}
          {mitVorschlag.length > 0 && (
            <span> Ersatz laut Wahlrang: {mitVorschlag.map(e => `${e.ersatz!.name} für ${e.fuer.name}`).join(", ")}.</span>
          )}
          {" "}<Link to="/abwesenheiten" className="text-[rgb(var(--accent))] hover:underline">Kalender öffnen</Link>
        </div>
        {!readonly && kalender.offeneAenderungen > 0 && (
          <button onClick={onUebernehmen} disabled={uebernimmt}
            className="flex items-center gap-1 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white px-3 py-1 rounded-lg font-medium shrink-0"
            title="Abwesende auf „Verhindert“, alle anderen auf „Kommt“, Ersatzmitglieder laut Vorschlag laden">
            <Wand2 size={12} /> Aus Kalender übernehmen ({kalender.offeneAenderungen})
          </button>
        )}
      </div>

      {ohneErsatz.length > 0 && (
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
          Kein freies Ersatzmitglied mehr für {ohneErsatz.map(e => e.fuer.name).join(", ")} – alle Ersatzmitglieder sind verplant oder selbst abwesend.
        </p>
      )}
      {kalender.konflikte.length > 0 && (
        <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
          Geladen, aber laut Kalender abwesend: {kalender.konflikte.map(k => k.name).join(", ")} – bitte Ladung prüfen.
        </p>
      )}
      <p className={p.beschlussfaehig ? "text-green-700" : "text-red-700 font-medium"}>
        Beschlussfähigkeit (§ 33 Abs. 2 BetrVG): voraussichtlich {p.mitErsatz} von {p.sollStaerke} Sitzen besetzt
        {mitVorschlag.length > 0 && ` (mit vorgeschlagenem Ersatz; ohne ${p.ohneNeuenErsatz})`}, nötig sind {p.mindestens}
        {" "}→ {p.beschlussfaehig ? "beschlussfähig" : "nicht beschlussfähig"}.
      </p>
      {meldung && <p className="text-green-700">{meldung}</p>}
    </div>
  );
}
