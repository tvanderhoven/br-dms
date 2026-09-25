import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Clock, CheckCircle, FileText, Inbox,
  CalendarDays, FolderInput, XCircle, ClipboardList,
} from "lucide-react";
import { api, Dokument, Frist, SitzungListItem, Aufgabe, WatchfolderLogEintrag, fristFarbe, formatDatum, KATEGORIE_LABEL } from "../lib/api";

interface FristMitDokument extends Frist {
  dokumentTitel: string;
  dokumentId:    string;
  kategorie:     string;
}

const FRIST_LABEL: Record<string, string> = {
  ANHOERUNG_99_WOCHE:             "Anhörungsfrist § 99 (1 Woche)",
  ANHOERUNG_102_ORDENTLICH:       "Anhörungsfrist § 102 ordentlich (1 Woche)",
  ANHOERUNG_102_AUSSERORDENTLICH: "Anhörungsfrist § 102 außerordentlich (3 Tage)",
  WIDERSPRUCH:                    "Widerspruchsfrist § 99/102 (1 Woche)",
};

// ── Stat-Karte ────────────────────────────────────────────────────
function StatKarte({ icon, titel, wert, sub, farbe, href }: {
  icon: React.ReactElement; titel: string; wert: number | string;
  sub?: string; farbe: "blue" | "red" | "amber" | "indigo"; href?: string;
}) {
  const iconKlasse: Record<string, string> = {
    blue:   "text-blue-600 bg-blue-50",
    red:    "text-red-600 bg-red-50",
    amber:  "text-amber-600 bg-amber-50",
    indigo: "text-indigo-600 bg-indigo-50",
  };
  const inner = (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow h-full">
      <div className={`p-2 rounded-lg w-fit mb-3 ${iconKlasse[farbe]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{wert}</p>
      <p className="text-sm text-gray-500 mt-1">{titel}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
  return href ? <Link to={href} className="block">{inner}</Link> : inner;
}

export default function Dashboard() {
  const [dokumente, setDokumente] = useState<Dokument[]>([]);
  const [inboxDoks, setInboxDoks] = useState<Dokument[]>([]);
  const [sitzungen, setSitzungen] = useState<SitzungListItem[]>([]);
  const [aufgaben, setAufgaben]   = useState<Aufgabe[]>([]);
  const [watchLog, setWatchLog]   = useState<WatchfolderLogEintrag[]>([]);
  const [laden, setLaden]         = useState(true);
  const [meinVorname, setMeinVorname] = useState("");

  useEffect(() => {
    Promise.all([
      api.dokumente.liste(),
      api.dokumente.inbox().catch(() => [] as Dokument[]), // nur Vorsitz/Stellvertreter/Admin dürfen das
      api.sitzungen.liste(),
      api.aufgaben.liste().catch(() => [] as Aufgabe[]),
      api.watchfolder.log().catch(() => [] as WatchfolderLogEintrag[]),
    ]).then(([docs, inbox, sits, aufg, wlog]) => {
      setDokumente(docs);
      setInboxDoks(inbox);
      setSitzungen(sits);
      setAufgaben(aufg);
      setWatchLog(wlog);
    }).catch(console.error).finally(() => setLaden(false));
    api.auth.me().then(b => setMeinVorname(b.name.split(" ")[0])).catch(() => {});
  }, []);

  const alleFristen: FristMitDokument[] = dokumente.flatMap(d =>
    (d.fristen ?? [])
      .filter(f => f.status === "OFFEN")
      .map(f => ({ ...f, dokumentTitel: d.titel, dokumentId: d.id, kategorie: d.kategorie }))
  ).sort((a, b) => new Date(a.faelligAm).getTime() - new Date(b.faelligAm).getTime());

  const tageVergangen = (iso: string) =>
    Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

  const abgelaufen  = alleFristen.filter(f => tageVergangen(f.faelligAm) < 0);
  const kritisch    = alleFristen.filter(f => { const t = tageVergangen(f.faelligAm); return t >= 0 && t <= 3; });
  const diese_woche = alleFristen.filter(f => { const t = tageVergangen(f.faelligAm); return t > 3 && t <= 7; });

  const baldGeloescht = dokumente
    .filter(d => d.deleteAt && tageVergangen(d.deleteAt) <= 30 && tageVergangen(d.deleteAt) >= 0)
    .sort((a, b) => new Date(a.deleteAt!).getTime() - new Date(b.deleteAt!).getTime());

  const heute = new Date();
  const naechsteSitzung = sitzungen
    .filter(s => new Date(s.sitzungsdatum) >= heute && s.status !== "ABGESAGT")
    .sort((a, b) => new Date(a.sitzungsdatum).getTime() - new Date(b.sitzungsdatum).getTime())[0];
  const tageBisNaechste = naechsteSitzung
    ? Math.ceil((new Date(naechsteSitzung.sitzungsdatum).getTime() - heute.getTime()) / 86_400_000)
    : null;

  const ungelesen      = inboxDoks.filter(d => !d.inboxGelesen).length;
  // Themen aus dem Kanban-Backlog zählen hier nicht mit – das sind Ideen, keine ToDos
  // Nur eigenständige ToDos (wie auf der "Aufgaben"-Seite) – keine Zeitraum-Einträge/-Kinder
  const offeneAufgaben = aufgaben.filter(a => !a.erledigt && a.typ === "AUFGABE" && !a.oberProjektId && a.kanbanStatus == null);
  const kritischGesamt = abgelaufen.length + kritisch.length;

  const PRIO_SORT: Record<string, number> = { HOCH: 0, MITTEL: 1, NIEDRIG: 2 };
  const PRIO_BADGE: Record<string, string> = {
    HOCH:    "bg-red-100 text-red-700",
    MITTEL:  "bg-amber-100 text-amber-700",
    NIEDRIG: "bg-gray-100 text-gray-600",
  };

  const wochentag = heute.toLocaleDateString("de-DE", { weekday: "long" });
  const datumText = heute.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });

  if (laden) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Laden…</div>
  );

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-400">{wochentag}, {datumText}</p>
          <h1 className="text-xl font-bold text-gray-900 mt-0.5">
            {meinVorname ? `Hallo, ${meinVorname}` : "Dashboard"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/eingang" className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 transition-colors rounded-lg px-3 py-1.5 text-sm">
            <Inbox size={14} className="text-gray-500" />
            <span className="font-semibold text-gray-800">{ungelesen}</span>
            <span className="text-gray-500 text-xs">im Eingang</span>
          </Link>
          {naechsteSitzung && (
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5">
              <CalendarDays size={14} className="text-gray-500" />
              <span className="text-gray-700 text-xs">
                {tageBisNaechste === 0 ? "Sitzung heute" :
                 tageBisNaechste === 1 ? "Sitzung morgen" :
                 `Sitzung in ${tageBisNaechste} Tagen`}
              </span>
            </div>
          )}
          {kritischGesamt > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
              <AlertTriangle size={14} className="text-red-500" />
              <span className="text-red-700 text-xs font-medium">{kritischGesamt} kritische Fristen</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Stat-Karten ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatKarte
          icon={<FileText size={18} />}
          titel="Dokumente gesamt" wert={dokumente.length} farbe="blue"
          sub={`${inboxDoks.length} im Eingang`} href="/dokumente"
        />
        <StatKarte
          icon={<AlertTriangle size={18} />}
          titel="Abgelaufene Fristen" wert={abgelaufen.length} farbe="red"
          sub={abgelaufen.length > 0 ? "Sofort handeln" : "Alles im grünen Bereich"}
        />
        <StatKarte
          icon={<Clock size={18} />}
          titel="Kritisch (≤ 3 Tage)" wert={kritisch.length} farbe="amber"
          sub={`${diese_woche.length} diese Woche`}
        />
        <StatKarte
          icon={<ClipboardList size={18} />}
          titel="Offene Aufgaben" wert={offeneAufgaben.length} farbe="indigo"
          sub={offeneAufgaben.filter(a => a.prioritaet === "HOCH").length > 0
            ? `${offeneAufgaben.filter(a => a.prioritaet === "HOCH").length} mit hoher Priorität`
            : undefined}
          href="/aufgaben"
        />
      </div>

      {/* ── Fristen + Löschdatum ──────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900 text-sm">Offene Fristen</h2>
            </div>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{alleFristen.length}</span>
          </div>
          {alleFristen.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              <CheckCircle className="mx-auto mb-2 text-green-400" size={26} />
              Keine offenen Fristen
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {alleFristen.slice(0, 10).map(f => {
                const tage = tageVergangen(f.faelligAm);
                return (
                  <li key={f.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to="/dokumente" className="text-sm font-medium text-gray-900 hover:text-[rgb(var(--accent))] truncate block">
                          {f.dokumentTitel}
                        </Link>
                        <p className="text-xs text-gray-400 mt-0.5">{FRIST_LABEL[f.typ] ?? f.typ}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${fristFarbe(f.faelligAm)}`}>
                        {tage < 0 ? `${Math.abs(tage)}T übf.` : tage === 0 ? "Heute" : `${tage}T`}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDatum(f.faelligAm)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900 text-sm">Bald automatisch gelöscht</h2>
            </div>
            <span className="text-xs text-gray-400">≤ 30 Tage</span>
          </div>
          {baldGeloescht.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              <CheckCircle className="mx-auto mb-2 text-green-400" size={26} />
              Keine Dokumente mit baldigem Löschdatum
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {baldGeloescht.map(d => (
                <li key={d.id} className="px-5 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{d.titel}</p>
                    <p className="text-xs text-gray-400">{KATEGORIE_LABEL[d.kategorie]}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${fristFarbe(d.deleteAt!)}`}>
                    {formatDatum(d.deleteAt!)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Aufgaben ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList size={15} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Offene Aufgaben</h2>
          </div>
          <Link to="/aufgaben" className="text-xs text-[rgb(var(--accent))] hover:underline">Alle anzeigen</Link>
        </div>
        {offeneAufgaben.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            <CheckCircle className="mx-auto mb-2 text-green-400" size={26} />
            Keine offenen Aufgaben
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {offeneAufgaben
              .sort((a, b) => {
                const pd = PRIO_SORT[a.prioritaet] - PRIO_SORT[b.prioritaet];
                if (pd !== 0) return pd;
                if (a.faelligAm && b.faelligAm) return new Date(a.faelligAm).getTime() - new Date(b.faelligAm).getTime();
                return 0;
              })
              .slice(0, 8)
              .map(a => (
                <li key={a.id} className="px-5 py-3 hover:bg-gray-50 transition-colors flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.titel}</p>
                    {a.zugewiesenAn && <p className="text-xs text-gray-400 mt-0.5">{a.zugewiesenAn.name}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.faelligAm && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border ${fristFarbe(a.faelligAm)}`}>
                        {formatDatum(a.faelligAm)}
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIO_BADGE[a.prioritaet]}`}>
                      {a.prioritaet}
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* ── WatchFolder ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
          <FolderInput size={15} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900 text-sm">WatchFolder – letzte Importe</h2>
        </div>
        {watchLog.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">Noch keine WatchFolder-Aktivität</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {watchLog.slice(0, 10).map(e => {
              const ok = e.aktion === "WATCHFOLDER_DATEI_EMPFANGEN";
              return (
                <li key={e.id} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                  {ok ? <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      : <XCircle    className="w-4 h-4 text-red-500  mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{e.details?.dateiname ?? "–"}</p>
                    {!ok && e.details?.fehler && <p className="text-xs text-red-500 truncate mt-0.5">{e.details.fehler}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(e.zeitpunkt).toLocaleString("de-DE", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
