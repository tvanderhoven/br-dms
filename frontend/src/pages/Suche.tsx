import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, FileText, CalendarDays, CheckSquare, BookOpen, Globe, ExternalLink, Scale, GraduationCap, Users, Gavel } from "lucide-react";
import {
  api, SuchErgebnis, KATEGORIE_LABEL, SITZUNG_STATUS_LABEL,
  RESSOURCE_KATEGORIE_LABEL, RESSOURCE_KATEGORIE_FARBE, formatDatum,
  GesetzParagraph,
} from "../lib/api";
import GesetzModal from "../components/GesetzModal";

const BV_STATUS_LABEL: Record<string, string> = {
  AKTIV: "Aktiv", GEKUENDIGT: "Gekündigt", ABGELOEST: "Abgelöst", BEFRISTET_AUSGELAUFEN: "Befristet ausgelaufen",
};
const SCHULUNG_STATUS_LABEL: Record<string, string> = {
  GEPLANT: "Geplant", ABSOLVIERT: "Absolviert", ABGESAGT: "Abgesagt",
};

const PRIORITAET_STYLE: Record<string, string> = {
  HOCH:    "bg-red-100 text-red-700",
  MITTEL:  "bg-amber-100 text-amber-700",
  NIEDRIG: "bg-green-100 text-green-700",
};
const PRIORITAET_LABEL: Record<string, string> = {
  HOCH: "Hoch", MITTEL: "Mittel", NIEDRIG: "Niedrig",
};

const SITZUNG_STATUS_STYLE: Record<string, string> = {
  ENTWURF:              "bg-gray-100 text-gray-600",
  TAGESORDNUNG_FIXIERT: "bg-accent/10 text-accent",
  PROTOKOLL_ENTWURF:    "bg-amber-100 text-amber-700",
  PROTOKOLL_FINAL:      "bg-green-100 text-green-700",
  ABGESCHLOSSEN:        "bg-emerald-100 text-emerald-700",
  ABGESAGT:             "bg-red-100 text-red-600",
};

const DOK_STATUS_STYLE: Record<string, string> = {
  AKTIV:            "bg-green-100 text-green-700",
  ARCHIVIERT:       "bg-gray-100 text-gray-600",
  LOESCHVORMERKUNG: "bg-red-100 text-red-700",
};
const DOK_STATUS_LABEL: Record<string, string> = {
  AKTIV: "Aktiv", ARCHIVIERT: "Archiviert", LOESCHVORMERKUNG: "Löschvormerkung",
};

export default function Suche() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [ergebnisse, setErgebnisse] = useState<SuchErgebnis | null>(null);
  const [laden, setLaden] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gesetzModal, setGesetzModal] = useState<GesetzParagraph | null>(null);
  const [gesetzLaden, setGesetzLaden] = useState(false);

  function gesetzOeffnen(id: string) {
    setGesetzLaden(true);
    api.gesetze.einzel(id).then(setGesetzModal).finally(() => setGesetzLaden(false));
  }

  const suche = useCallback((q: string) => {
    if (q.trim().length < 2) { setErgebnisse(null); return; }
    setLaden(true);
    api.suche(q)
      .then(setErgebnisse)
      .catch(() => {})
      .finally(() => setLaden(false));
  }, []);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setQuery(q);
    suche(q);
  }, [searchParams, suche]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (v.trim().length >= 2) setSearchParams({ q: v });
      else setSearchParams({});
    }, 300);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim().length >= 2) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setSearchParams({ q: query });
    }
  }

  const gesamt =
    (ergebnisse?.dokumente.length ?? 0) +
    (ergebnisse?.sitzungen.length ?? 0) +
    (ergebnisse?.aufgaben?.length ?? 0) +
    (ergebnisse?.wissen?.length ?? 0) +
    (ergebnisse?.ressourcen?.length ?? 0) +
    (ergebnisse?.betriebsvereinbarungen?.length ?? 0) +
    (ergebnisse?.schulungen?.length ?? 0) +
    (ergebnisse?.mitarbeiter?.length ?? 0) +
    (ergebnisse?.gesetze?.length ?? 0);

  const aktuellerBegriff = searchParams.get("q") ?? "";

  return (
    <div className="p-6">
      {/* Suchleiste */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-5 h-5 text-[rgb(var(--accent))]" />
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Suche</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder="Über alle Bereiche suchen…"
            autoFocus
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent)/0.3)] text-sm"
          />
        </div>
        {ergebnisse && aktuellerBegriff.length >= 2 && (
          <p className="text-xs text-gray-400 mt-2">
            {gesamt} Ergebnis{gesamt !== 1 ? "se" : ""} für „{aktuellerBegriff}"
          </p>
        )}
      </div>

      {laden && <p className="text-sm text-gray-400">Suche…</p>}

      {!laden && ergebnisse && gesamt === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Keine Treffer für „{aktuellerBegriff}"</p>
          <p className="text-xs mt-1">Versuche einen anderen Suchbegriff</p>
        </div>
      )}

      {!laden && !ergebnisse && (
        <div className="text-center py-16 text-gray-300 dark:text-gray-600">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Mindestens 2 Zeichen eingeben</p>
          <p className="text-xs mt-1">Durchsucht Dokumente, Aufgaben, Sitzungen, Wissensarchiv, Ressourcen, Betriebsvereinbarungen, Schulungen, Mitarbeiter & Gesetzestexte</p>
        </div>
      )}

      {ergebnisse && gesamt > 0 && (
        <div className="space-y-8">

          {/* ── Dokumente ── */}
          {ergebnisse.dokumente.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                <FileText className="w-3.5 h-3.5" />
                Dokumente
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-normal normal-case tracking-normal">
                  {ergebnisse.dokumente.length}
                </span>
              </h2>
              <div className="space-y-2">
                {ergebnisse.dokumente.map(dok => (
                  <button
                    key={dok.id}
                    onClick={() => navigate("/dokumente", { state: { markiere: dok.id } })}
                    className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-[rgb(var(--accent)/0.4)] hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">
                        {dok.alias ?? dok.titel}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${DOK_STATUS_STYLE[dok.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {DOK_STATUS_LABEL[dok.status] ?? dok.status}
                      </span>
                    </div>
                    {dok.alias && (
                      <p className="text-xs text-gray-400 mt-0.5">{dok.titel}</p>
                    )}
                    <div className="flex items-center flex-wrap gap-1.5 mt-2">
                      <span className="text-xs bg-accent/5 text-accent dark:bg-accent/10 dark:text-accent px-2 py-0.5 rounded-full">
                        {KATEGORIE_LABEL[dok.kategorie]}
                      </span>
                      {dok.tags?.map(tag => (
                        <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                      <span className="text-xs text-gray-400 ml-auto">{formatDatum(dok.erstelltAm)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Aufgaben ── */}
          {(ergebnisse.aufgaben?.length ?? 0) > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                <CheckSquare className="w-3.5 h-3.5" />
                Aufgaben
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-normal normal-case tracking-normal">
                  {ergebnisse.aufgaben!.length}
                </span>
              </h2>
              <div className="space-y-2">
                {ergebnisse.aufgaben!.map(auf => (
                  <button
                    key={auf.id}
                    onClick={() => navigate(
                      auf.kanbanStatus ? "/themen-backlog"
                      : auf.typ === "PROJEKT" ? "/aufgaben?ansicht=liste"
                      : "/aufgaben"
                    )}
                    className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-[rgb(var(--accent)/0.4)] hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium leading-snug ${auf.erledigt ? "line-through text-gray-400" : "text-gray-800 dark:text-gray-100"}`}>
                        {auf.titel}
                      </p>
                      {auf.erledigt ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex-shrink-0">
                          Erledigt
                        </span>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${PRIORITAET_STYLE[auf.prioritaet] ?? "bg-gray-100 text-gray-500"}`}>
                          {PRIORITAET_LABEL[auf.prioritaet] ?? auf.prioritaet}
                        </span>
                      )}
                    </div>
                    {auf.faelligAm && (
                      <p className="text-xs text-gray-400 mt-1">Fällig: {formatDatum(auf.faelligAm)}</p>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Sitzungen ── */}
          {ergebnisse.sitzungen.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                <CalendarDays className="w-3.5 h-3.5" />
                Sitzungen & Protokolle
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-normal normal-case tracking-normal">
                  {ergebnisse.sitzungen.length}
                </span>
              </h2>
              <div className="space-y-2">
                {ergebnisse.sitzungen.map(s => (
                  <button
                    key={s.id}
                    onClick={() => navigate("/sitzungen")}
                    className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-[rgb(var(--accent)/0.4)] hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">
                        {s.titel}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${SITZUNG_STATUS_STYLE[s.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {SITZUNG_STATUS_LABEL[s.status]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{formatDatum(s.sitzungsdatum)}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Wissensarchiv ── */}
          {(ergebnisse.wissen?.length ?? 0) > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                <BookOpen className="w-3.5 h-3.5" />
                Wissensarchiv
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-normal normal-case tracking-normal">
                  {ergebnisse.wissen!.length}
                </span>
              </h2>
              <div className="space-y-2">
                {ergebnisse.wissen!.map(w => (
                  <button
                    key={w.id}
                    onClick={() => navigate("/wissen")}
                    className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-[rgb(var(--accent)/0.4)] hover:shadow-sm transition-all"
                  >
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">
                      {w.titel}
                    </p>
                    {w.kategorien.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {w.kategorien.map(k => (
                          <span key={k} className="text-xs bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded-full">
                            {k}
                          </span>
                        ))}
                        <span className="text-xs text-gray-400 ml-auto">{formatDatum(w.erstelltAm)}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Ressourcen ── */}
          {(ergebnisse.ressourcen?.length ?? 0) > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                <Globe className="w-3.5 h-3.5" />
                Ressourcen
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-normal normal-case tracking-normal">
                  {ergebnisse.ressourcen!.length}
                </span>
              </h2>
              <div className="space-y-2">
                {ergebnisse.ressourcen!.map(r => (
                  <a
                    key={r.id}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-[rgb(var(--accent)/0.4)] hover:shadow-sm transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${RESSOURCE_KATEGORIE_FARBE[r.kategorie]}`}>
                          {RESSOURCE_KATEGORIE_LABEL[r.kategorie]}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{r.titel}</p>
                      <p className="text-xs text-accent/80 truncate mt-0.5">{r.url}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-[rgb(var(--accent))] flex-shrink-0 mt-0.5 transition-colors" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* ── Betriebsvereinbarungen ── */}
          {(ergebnisse.betriebsvereinbarungen?.length ?? 0) > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                <Scale className="w-3.5 h-3.5" />
                Betriebsvereinbarungen
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-normal normal-case tracking-normal">
                  {ergebnisse.betriebsvereinbarungen!.length}
                </span>
              </h2>
              <div className="space-y-2">
                {ergebnisse.betriebsvereinbarungen!.map(bv => (
                  <button
                    key={bv.id}
                    onClick={() => navigate("/betriebsvereinbarungen")}
                    className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-[rgb(var(--accent)/0.4)] hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">{bv.titel}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 bg-gray-100 text-gray-600">
                        {BV_STATUS_LABEL[bv.status] ?? bv.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{formatDatum(bv.abschlussdatum)}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Schulungen ── */}
          {(ergebnisse.schulungen?.length ?? 0) > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                <GraduationCap className="w-3.5 h-3.5" />
                Schulungen
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-normal normal-case tracking-normal">
                  {ergebnisse.schulungen!.length}
                </span>
              </h2>
              <div className="space-y-2">
                {ergebnisse.schulungen!.map(s => (
                  <button
                    key={s.id}
                    onClick={() => navigate("/schulungen")}
                    className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-[rgb(var(--accent)/0.4)] hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">
                        {s.qualifikation.name}{s.titel ? ` – ${s.titel}` : ""}
                      </p>
                      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 bg-gray-100 text-gray-600">
                        {SCHULUNG_STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{formatDatum(s.datum)}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Mitarbeiter ── */}
          {(ergebnisse.mitarbeiter?.length ?? 0) > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                <Users className="w-3.5 h-3.5" />
                Mitarbeiter
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-normal normal-case tracking-normal">
                  {ergebnisse.mitarbeiter!.length}
                </span>
              </h2>
              <div className="space-y-2">
                {ergebnisse.mitarbeiter!.map(m => (
                  <button
                    key={m.id}
                    onClick={() => navigate("/gehaltstabelle")}
                    className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-[rgb(var(--accent)/0.4)] hover:shadow-sm transition-all"
                  >
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">{m.nachname}, {m.vorname}</p>
                    <p className="text-xs text-gray-400 mt-1">{[m.pnr ? `PNR ${m.pnr}` : null, m.abteilung?.name].filter(Boolean).join(" · ") || "–"}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Gesetzestexte ── */}
          {(ergebnisse.gesetze?.length ?? 0) > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                <Gavel className="w-3.5 h-3.5" />
                Gesetzestexte
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-normal normal-case tracking-normal">
                  {ergebnisse.gesetze!.length}
                </span>
              </h2>
              <div className="space-y-2">
                {ergebnisse.gesetze!.map(g => (
                  <button
                    key={g.id}
                    onClick={() => gesetzOeffnen(g.id)}
                    className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-[rgb(var(--accent)/0.4)] hover:shadow-sm transition-all"
                  >
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">
                      {g.gesetz} {g.paragraph}{g.titel ? ` – ${g.titel}` : ""}
                    </p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{g.text}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

        </div>
      )}

      {(gesetzModal || gesetzLaden) && (
        <GesetzModal paragraph={gesetzModal} laden={gesetzLaden} onSchliessen={() => setGesetzModal(null)} />
      )}
    </div>
  );
}
