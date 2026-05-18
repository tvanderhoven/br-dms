import { useEffect, useState } from "react";
import { api, Benutzer } from "../lib/api";
import { CheckCircle, XCircle, HelpCircle, UserCheck, UserPlus } from "lucide-react";

export type AnwesenheitsStatus = "ANWESEND" | "ABWESEND_ENTSCHULDIGT" | "ABWESEND_UNENTSCHULDIGT" | "ERSATZ_FUER";

interface Anwesenheit {
  id: string;
  status: AnwesenheitsStatus;
  vertretungFuer?: { id: string; name: string } | null;
  benutzer: { id: string; name: string; rolle: string };
}

interface ListItem {
  benutzer: Benutzer;
  anwesenheit: Anwesenheit | null;
}

const STATUS_LABEL: Record<AnwesenheitsStatus, string> = {
  ANWESEND: "Anwesend",
  ABWESEND_ENTSCHULDIGT: "Abwesend (entschuldigt)",
  ABWESEND_UNENTSCHULDIGT: "Abwesend (unentschuldigt)",
  ERSATZ_FUER: "Ersatzmitglied",
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
}

export default function AnwesenheitsListe({ sitzungId, readonly = false }: Props) {
  const [liste,          setListe]          = useState<ListItem[]>([]);
  const [isLaden,        setIsLaden]        = useState(true);
  const [speichern,      setSpeichern]      = useState<string | null>(null);
  // benutzerId → pending vertretungFuerId (wenn ERSATZ_FUER gewählt, aber noch nicht bestätigt)
  const [pendingErsatz,  setPendingErsatz]  = useState<Record<string, string>>({});

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
  }

  async function setStatus(benutzerId: string, status: AnwesenheitsStatus, vertretungFuerId?: string) {
    setSpeichern(benutzerId);
    try {
      await api.post(`/api/sitzungen/${sitzungId}/anwesenheit`, {
        benutzerId,
        status,
        vertretungFuerId,
      });
      ladeDaten();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSpeichern(null);
    }
  }

  function onStatusChange(item: ListItem, newStatus: AnwesenheitsStatus | "") {
    if (newStatus === "ERSATZ_FUER") {
      // Erst vertretungFuerId abfragen, dann speichern
      setPendingErsatz(prev => ({ ...prev, [item.benutzer.id]: "" }));
    } else if (newStatus !== "") {
      setPendingErsatz(prev => {
        const n = { ...prev };
        delete n[item.benutzer.id];
        return n;
      });
      setStatus(item.benutzer.id, newStatus);
    }
  }

  function ersatzBestaetigen(ersatzId: string) {
    const vertretungFuerId = pendingErsatz[ersatzId];
    if (!vertretungFuerId) return;
    setPendingErsatz(prev => {
      const n = { ...prev };
      delete n[ersatzId];
      return n;
    });
    setStatus(ersatzId, "ERSATZ_FUER", vertretungFuerId);
  }

  const anwesend = liste.filter(l => l.anwesenheit?.status === "ANWESEND").length;
  const gesamt   = liste.length;

  // Ordentliche Mitglieder für "Vertritt:"-Dropdown
  const ordentlicheMitglieder = liste.filter(l =>
    l.benutzer.rolle === "VORSITZ" || l.benutzer.rolle === "MITGLIED"
  );

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
          <h3 className="font-semibold text-gray-800 text-sm">Anwesenheit</h3>
          <span className="text-xs text-gray-500">
            {anwesend} von {gesamt} anwesend
          </span>
        </div>
      </div>

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
                    {item.benutzer.rolle}
                    {item.anwesenheit?.status === "ERSATZ_FUER" && item.anwesenheit.vertretungFuer && (
                      <span className="ml-1 text-[rgb(var(--accent))]">für {item.anwesenheit.vertretungFuer.name}</span>
                    )}
                  </p>
                </div>

                {/* Status-Steuerung */}
                {!readonly && (
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Nachladen-Button für Ersatzmitglieder ohne Eintrag */}
                    {istErsatz && !item.anwesenheit && !hasPending && (
                      <button
                        onClick={() => setPendingErsatz(prev => ({ ...prev, [item.benutzer.id]: "" }))}
                        className="flex items-center gap-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg transition-colors"
                        title="Als Ersatzmitglied nachladen"
                      >
                        <UserPlus size={12} /> Nachladen
                      </button>
                    )}

                    <select
                      value={item.anwesenheit?.status ?? ""}
                      onChange={e => onStatusChange(item, e.target.value as AnwesenheitsStatus | "")}
                      disabled={speichern === item.benutzer.id || hasPending}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] disabled:opacity-50"
                    >
                      <option value="">Nicht gesetzt</option>
                      <option value="ANWESEND">Anwesend</option>
                      <option value="ABWESEND_ENTSCHULDIGT">Abwesend (entschuldigt)</option>
                      <option value="ABWESEND_UNENTSCHULDIGT">Abwesend (unentschuldigt)</option>
                      <option value="ERSATZ_FUER">Ersatzmitglied</option>
                    </select>
                  </div>
                )}

                {readonly && item.anwesenheit && (
                  <span className="text-xs text-gray-500">{STATUS_LABEL[item.anwesenheit.status]}</span>
                )}
              </div>

              {/* Inline-Picker: Für wen vertritt dieses Ersatzmitglied? */}
              {!readonly && hasPending && (
                <div className="px-4 pb-3 pt-1 bg-blue-50 border-t border-blue-100 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-blue-700">Vertritt:</span>
                  <select
                    value={pendingErsatz[item.benutzer.id]}
                    onChange={e =>
                      setPendingErsatz(prev => ({ ...prev, [item.benutzer.id]: e.target.value }))
                    }
                    className="border border-blue-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
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
        </div>
      </div>
    </div>
  );
}
