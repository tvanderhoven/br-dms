import { useState, useEffect, useCallback } from "react";
import {
  ClipboardList, ChevronLeft, ChevronRight, Search, X,
  Loader2, ShieldAlert, User, FileText, CalendarDays,
} from "lucide-react";
import {
  api, AuditEintrag, AuditAktion, AuditSeite,
  AUDIT_AKTION_LABEL, Benutzer, formatDatum,
} from "../lib/api";

// ── Aktions-Kategorien für den Filter ────────────────────────────
const KATEGORIEN: { label: string; aktionen: AuditAktion[] }[] = [
  {
    label: "Anmeldung",
    aktionen: ["LOGIN", "LOGOUT", "ZUGRIFF_VERWEIGERT", "PASSWORT_GEAENDERT"],
  },
  {
    label: "Dokumente",
    aktionen: [
      "DOKUMENT_ERSTELLT", "DOKUMENT_ANGESEHEN", "DOKUMENT_HERUNTERGELADEN",
      "DOKUMENT_AKTUALISIERT", "DOKUMENT_GELOESCHT", "DOKUMENT_METADATEN_GEAENDERT",
      "DOKUMENT_TAG_GEAENDERT", "DOKUMENT_ALIAS_GEAENDERT", "DOKUMENT_TOP_GEAENDERT",
      "DOKUMENT_AUFGABE_ERSTELLT", "INBOX_DOKUMENT_GELESEN",
      "WATCHFOLDER_DATEI_EMPFANGEN", "WATCHFOLDER_FEHLER",
      "FRIST_ERSTELLT", "FRIST_ERLEDIGT",
    ],
  },
  {
    label: "Benutzer",
    aktionen: ["BENUTZER_ERSTELLT", "BENUTZER_DEAKTIVIERT", "BENUTZER_GELOESCHT"],
  },
  {
    label: "Sitzungen",
    aktionen: [
      "SITZUNG_ERSTELLT", "SITZUNG_AKTUALISIERT", "SITZUNG_FIXIERT",
      "SITZUNG_PROTOKOLL_GESTARTET", "SITZUNG_FINALISIERT", "SITZUNG_GELOESCHT",
      "ABSTIMMUNG_ERSTELLT", "ABSTIMMUNG_FINALISIERT",
    ],
  },
  {
    label: "Wissen & Nachrichten",
    aktionen: ["WISSEN_ERSTELLT", "WISSEN_AKTUALISIERT", "WISSEN_GELOESCHT", "NACHRICHT_GESENDET"],
  },
];

// ── Farben pro Aktion ─────────────────────────────────────────────
function aktionFarbe(a: AuditAktion): string {
  if (["DOKUMENT_GELOESCHT", "BENUTZER_DEAKTIVIERT", "BENUTZER_GELOESCHT", "SITZUNG_GELOESCHT", "WISSEN_GELOESCHT"].includes(a))
    return "bg-red-100 text-red-700";
  if (["ZUGRIFF_VERWEIGERT", "WATCHFOLDER_FEHLER"].includes(a))
    return "bg-orange-100 text-orange-700";
  if (["PASSWORT_GEAENDERT"].includes(a))
    return "bg-yellow-100 text-yellow-700";
  if (["LOGIN", "DOKUMENT_ERSTELLT", "BENUTZER_ERSTELLT", "SITZUNG_ERSTELLT",
       "SITZUNG_FINALISIERT", "ABSTIMMUNG_FINALISIERT", "WISSEN_ERSTELLT",
       "WATCHFOLDER_DATEI_EMPFANGEN"].includes(a))
    return "bg-green-100 text-green-700";
  if (["DOKUMENT_ANGESEHEN", "DOKUMENT_HERUNTERGELADEN", "INBOX_DOKUMENT_GELESEN"].includes(a))
    return "bg-accent/10 text-accent";
  return "bg-gray-100 text-gray-600";
}

function formatZeit(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Details-Vorschau ──────────────────────────────────────────────
function DetailsVorschau({ details }: { details: Record<string, unknown> | null }) {
  const [offen, setOffen] = useState(false);
  if (!details || Object.keys(details).length === 0) return <span className="text-gray-300">–</span>;

  const keys = Object.keys(details);
  const kurzText = keys.slice(0, 2).map(k => `${k}: ${String(details[k]).slice(0, 30)}`).join(", ");

  return (
    <div>
      <button
        onClick={() => setOffen(!offen)}
        className="text-xs text-accent/80 hover:text-accent underline underline-offset-2"
      >
        {kurzText.slice(0, 50)}{kurzText.length > 50 ? "…" : ""}
      </button>
      {offen && (
        <pre className="mt-1 text-xs bg-gray-50 border border-gray-200 rounded p-2 whitespace-pre-wrap break-all max-w-xs">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Hauptkomponente ───────────────────────────────────────────────
export default function Auditlog() {
  const [daten, setDaten]               = useState<AuditSeite | null>(null);
  const [laden, setLaden]               = useState(true);
  const [fehler, setFehler]             = useState("");
  const [benutzerListe, setBenutzerListe] = useState<Benutzer[]>([]);

  // Filter
  const [seite, setSeite]               = useState(1);
  const [benutzerId, setBenutzerId]     = useState("");
  const [aktivKat, setAktivKat]         = useState<string>("");
  const [aktivAktion, setAktivAktion]   = useState<string>("");
  const [von, setVon]                   = useState("");
  const [bis, setBis]                   = useState("");

  // Benutzer für Filter laden
  useEffect(() => {
    api.get<Benutzer[]>("/api/benutzer").then(setBenutzerListe).catch(() => {});
  }, []);

  const laden_ = useCallback(() => {
    setLaden(true);
    setFehler("");
    api.audit.liste({ seite, benutzerId: benutzerId || undefined, aktion: aktivAktion || undefined, von: von || undefined, bis: bis || undefined })
      .then(setDaten)
      .catch(e => setFehler(e.message ?? "Fehler"))
      .finally(() => setLaden(false));
  }, [seite, benutzerId, aktivAktion, von, bis]);

  useEffect(() => { laden_(); }, [laden_]);

  function filterReset() {
    setBenutzerId("");
    setAktivKat("");
    setAktivAktion("");
    setVon("");
    setBis("");
    setSeite(1);
  }

  function katWaehlen(kat: string) {
    if (kat === aktivKat) {
      setAktivKat("");
      setAktivAktion("");
    } else {
      setAktivKat(kat);
      setAktivAktion("");
    }
    setSeite(1);
  }

  function aktionWaehlen(a: string) {
    setAktivAktion(a === aktivAktion ? "" : a);
    setSeite(1);
  }

  const hatFilter = !!(benutzerId || aktivAktion || von || bis);

  if (fehler === "HTTP 403" || fehler.includes("403")) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 text-center px-4">
        <ShieldAlert size={48} className="text-red-400 mb-3" />
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Kein Zugriff</h2>
        <p className="text-sm text-gray-500">Das Audit-Log ist nur für Administratoren und den Vorsitz zugänglich.</p>
      </div>
    );
  }

  const aktuelleKatAktionen = KATEGORIEN.find(k => k.label === aktivKat)?.aktionen ?? [];

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="text-[rgb(var(--accent))]" size={22} />
            <div>
              <h1 className="text-lg font-bold text-gray-900">Audit-Log</h1>
              <p className="text-xs text-gray-400">
                {daten ? `${daten.gesamt.toLocaleString("de-DE")} Einträge` : "Lade…"}
              </p>
            </div>
          </div>
          {hatFilter && (
            <button
              onClick={filterReset}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:border-red-300 transition-colors"
            >
              <X size={13} /> Filter zurücksetzen
            </button>
          )}
        </div>

        {/* Filterzeile */}
        <div className="mt-3 flex flex-wrap gap-2 items-end">

          {/* Benutzer */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400 flex items-center gap-1"><User size={11} />Benutzer</label>
            <select
              value={benutzerId}
              onChange={e => { setBenutzerId(e.target.value); setSeite(1); }}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent)/0.3)] min-w-[160px]"
            >
              <option value="">Alle Benutzer</option>
              {benutzerListe.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Von */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400 flex items-center gap-1"><CalendarDays size={11} />Von</label>
            <input
              type="date"
              value={von}
              onChange={e => { setVon(e.target.value); setSeite(1); }}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent)/0.3)]"
            />
          </div>

          {/* Bis */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">Bis</label>
            <input
              type="date"
              value={bis}
              onChange={e => { setBis(e.target.value); setSeite(1); }}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent)/0.3)]"
            />
          </div>
        </div>

        {/* Kategorie-Chips */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {KATEGORIEN.map(kat => (
            <button
              key={kat.label}
              onClick={() => katWaehlen(kat.label)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${
                aktivKat === kat.label
                  ? "bg-[rgb(var(--accent))] text-white border-[rgb(var(--accent))]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-[rgb(var(--accent)/0.5)]"
              }`}
            >
              {kat.label}
            </button>
          ))}
        </div>

        {/* Aktions-Chips (nur wenn Kategorie gewählt) */}
        {aktivKat && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {aktuelleKatAktionen.map(a => (
              <button
                key={a}
                onClick={() => aktionWaehlen(a)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  aktivAktion === a
                    ? `${aktionFarbe(a as AuditAktion)} border-transparent font-semibold`
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                }`}
              >
                {AUDIT_AKTION_LABEL[a as AuditAktion]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabelle */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {laden ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
          </div>
        ) : fehler ? (
          <div className="flex items-center justify-center h-48 text-red-500 text-sm">
            {fehler}
          </div>
        ) : !daten || daten.eintraege.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm">
            <Search size={32} className="mb-2 opacity-30" />
            {hatFilter ? "Keine Einträge für diese Filterauswahl" : "Noch keine Audit-Einträge"}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Zeitpunkt</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Benutzer</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Aktion</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Kontext</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {daten.eintraege.map((e: AuditEintrag) => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap font-mono">
                      {formatZeit(e.zeitpunkt)}
                    </td>
                    <td className="px-4 py-2.5">
                      {e.benutzer ? (
                        <div>
                          <p className="text-sm font-medium text-gray-800">{e.benutzer.name}</p>
                          <p className="text-xs text-gray-400">{e.benutzer.email}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 italic">System</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${aktionFarbe(e.aktion)}`}>
                        {AUDIT_AKTION_LABEL[e.aktion] ?? e.aktion}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[180px]">
                      {e.dokument ? (
                        <div className="flex items-center gap-1 truncate">
                          <FileText size={12} className="text-gray-400 flex-shrink-0" />
                          <span className="truncate" title={e.dokument.alias ?? e.dokument.titel}>
                            {e.dokument.alias ?? e.dokument.titel}
                          </span>
                        </div>
                      ) : e.sitzung ? (
                        <div className="flex items-center gap-1 truncate">
                          <CalendarDays size={12} className="text-gray-400 flex-shrink-0" />
                          <span className="truncate" title={e.sitzung.titel}>{e.sitzung.titel}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300">–</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-400 whitespace-nowrap">
                      {e.ip ?? "–"}
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <DetailsVorschau details={e.details} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {daten && daten.seiten > 1 && (
        <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Seite {daten.seite} von {daten.seiten} · {daten.gesamt.toLocaleString("de-DE")} Einträge
          </p>
          <div className="flex items-center gap-1.5">
            <button
              disabled={daten.seite <= 1}
              onClick={() => setSeite(s => s - 1)}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(daten.seiten, 7) }, (_, i) => {
              const p = daten.seiten <= 7 ? i + 1
                : daten.seite <= 4 ? i + 1
                : daten.seite >= daten.seiten - 3 ? daten.seiten - 6 + i
                : daten.seite - 3 + i;
              return (
                <button
                  key={p}
                  onClick={() => setSeite(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    p === daten.seite
                      ? "bg-[rgb(var(--accent))] text-white"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              disabled={daten.seite >= daten.seiten}
              onClick={() => setSeite(s => s + 1)}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
