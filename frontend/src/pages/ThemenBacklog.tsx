/**
 * Themen-Backlog – Übersicht der Themenakten (Roadmap: Themenakte mit Verlauf)
 *
 * Board nach Status (offen / in Verhandlung / ruht / abgeschlossen), Status per Drag & Drop
 * oder Pfeilen, schnelles Anlegen je Spalte. Ein Klick öffnet die Akte (ThemaAkte.tsx).
 * Die früheren Backlog-Karten hat das Backend beim Update als Themen übernommen.
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Lightbulb, Kanban, Lock, MessageSquare, User, CalendarClock, Users } from "lucide-react";
import { api, ThemaListeEintrag, ThemaStatus, THEMA_STATUS_LABEL, formatDatum } from "../lib/api";

const SPALTEN: ThemaStatus[] = ["OFFEN", "IN_VERHANDLUNG", "RUHT", "ABGESCHLOSSEN"];

export default function ThemenBacklog() {
  const navigate = useNavigate();
  const [themen, setThemen]       = useState<ThemaListeEintrag[]>([]);
  const [laden, setLaden]         = useState(true);
  const [fehler, setFehler]       = useState("");
  const [neuTitel, setNeuTitel]   = useState<Partial<Record<ThemaStatus, string>>>({});
  const [ziehtUeber, setZiehtUeber] = useState<ThemaStatus | null>(null);
  const [suche, setSuche]         = useState("");

  useEffect(() => { neuLaden(); }, []);

  function neuLaden() {
    api.themenakte.liste()
      .then(setThemen)
      .catch(e => setFehler(e instanceof Error ? e.message : "Fehler"))
      .finally(() => setLaden(false));
  }

  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase();
    if (!s) return themen;
    return themen.filter(t => t.titel.toLowerCase().includes(s) || t.beteiligte.some(b => b.benutzer.name.toLowerCase().includes(s)));
  }, [themen, suche]);

  async function anlegen(status: ThemaStatus) {
    const titel = (neuTitel[status] ?? "").trim();
    if (!titel) return;
    try {
      const t = await api.themenakte.erstellen({ titel, status });
      setNeuTitel(n => ({ ...n, [status]: "" }));
      navigate(`/themenakte/${t.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Fehler beim Anlegen");
    }
  }

  async function statusAendern(t: ThemaListeEintrag, status: ThemaStatus) {
    const vorher = themen;
    setThemen(liste => liste.map(x => x.id === t.id ? { ...x, status } : x));
    try {
      await api.themenakte.aendern(t.id, { status });
    } catch (e) {
      setThemen(vorher);
      alert(e instanceof Error ? e.message : "Fehler");
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Kanban className="text-[rgb(var(--accent))]" size={26} />
            Themen-Backlog
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {themen.length} {themen.length === 1 ? "Thema" : "Themen"} · jedes mit eigener Akte: Verlauf, Gesprächsvermerke, Dokumente, TOPs
          </p>
        </div>
        <input
          value={suche}
          onChange={e => setSuche(e.target.value)}
          placeholder="Thema oder Person suchen…"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 max-w-full focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]"
        />
      </div>

      {fehler && <p className="text-sm text-red-700 mb-4">{fehler}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {SPALTEN.map((status, idx) => {
          const karten = gefiltert.filter(t => t.status === status);
          return (
            <div
              key={status}
              onDragOver={e => { e.preventDefault(); setZiehtUeber(status); }}
              onDragLeave={() => setZiehtUeber(s => (s === status ? null : s))}
              onDrop={e => {
                e.preventDefault();
                setZiehtUeber(null);
                const t = themen.find(x => x.id === e.dataTransfer.getData("text/thema-id"));
                if (t && t.status !== status) statusAendern(t, status);
              }}
              className={`rounded-xl border transition-colors ${
                ziehtUeber === status ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/5" : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">{THEMA_STATUS_LABEL[status]}</h3>
                <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full">{karten.length}</span>
              </div>

              <div className="p-2.5 space-y-2 min-h-[80px]">
                {laden && <p className="text-xs text-gray-400 text-center py-4">Laden…</p>}
                {karten.map(t => {
                  const zustaendig = t.beteiligte.filter(b => b.zustaendig);
                  const team = t.beteiligte.length - zustaendig.length;
                  const termin = t.naechsterTermin ? new Date(t.naechsterTermin) : null;
                  const ueberfaellig = termin && termin < new Date() && status !== "ABGESCHLOSSEN";
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={e => e.dataTransfer.setData("text/thema-id", t.id)}
                      onClick={e => { if (!(e.target as HTMLElement).closest("button")) navigate(`/themenakte/${t.id}`); }}
                      className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 cursor-pointer hover:border-[rgb(var(--accent))]/50"
                    >
                      <p className="text-sm font-medium text-gray-800 wrap-break-word flex items-start gap-1.5">
                        {t.vertraulichkeit !== "ALLE" && <Lock size={12} className="text-amber-600 mt-1 shrink-0" aria-label="vertraulich" />}
                        <span>{t.titel}</span>
                      </p>
                      {t.naechsterSchritt && (
                        <p className={`text-xs mt-1.5 flex items-start gap-1 ${ueberfaellig ? "text-red-700" : "text-gray-600"}`}>
                          <CalendarClock size={11} className="mt-0.5 shrink-0" />
                          <span>{t.naechsterSchritt}{termin && ` · bis ${formatDatum(t.naechsterTermin!)}`}</span>
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-xs text-gray-500">
                        {zustaendig.length > 0 && (
                          <span className="flex items-center gap-1"><User size={10} />{zustaendig.map(b => b.benutzer.name).join(", ")}</span>
                        )}
                        {team > 0 && <span className="flex items-center gap-1" title="Projektteam"><Users size={10} />+{team}</span>}
                        <span className="flex items-center gap-1" title="Beiträge"><MessageSquare size={10} />{t._count.eintraege}</span>
                        <span className="ml-auto text-gray-400" title="Letzte Aktivität">{formatDatum(t.letzteAktivitaet)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                        <button
                          disabled={idx === 0}
                          onClick={() => statusAendern(t, SPALTEN[idx - 1])}
                          className="text-gray-300 hover:text-gray-600 disabled:opacity-0 disabled:pointer-events-none"
                          title={idx > 0 ? `Zurück zu „${THEMA_STATUS_LABEL[SPALTEN[idx - 1]]}“` : undefined}
                        ><ChevronLeft size={15} /></button>
                        <span className="text-[11px] text-gray-300">{THEMA_STATUS_LABEL[status]}</span>
                        <button
                          disabled={idx === SPALTEN.length - 1}
                          onClick={() => statusAendern(t, SPALTEN[idx + 1])}
                          className="text-gray-300 hover:text-gray-600 disabled:opacity-0 disabled:pointer-events-none"
                          title={idx < SPALTEN.length - 1 ? `Weiter zu „${THEMA_STATUS_LABEL[SPALTEN[idx + 1]]}“` : undefined}
                        ><ChevronRight size={15} /></button>
                      </div>
                    </div>
                  );
                })}
                {!laden && karten.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Keine Themen</p>}

                {status !== "ABGESCHLOSSEN" && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <Lightbulb size={13} className="text-gray-300 shrink-0" />
                    <input
                      type="text"
                      value={neuTitel[status] ?? ""}
                      onChange={e => setNeuTitel(n => ({ ...n, [status]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") anlegen(status); }}
                      placeholder="+ Thema / Idee…"
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
