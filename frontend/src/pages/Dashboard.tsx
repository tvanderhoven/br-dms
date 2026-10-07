import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, Clock, CheckCircle, FileText, Inbox,
  CalendarDays, FolderInput, XCircle, ClipboardList, Scale, GraduationCap, Users,
} from "lucide-react";
import {
  api, Dokument, FristMitDokument, SitzungListItem, Aufgabe, WatchfolderLogEintrag, fristFarbe, formatDatum,
  KATEGORIE_LABEL, FRIST_TYP_LABEL, fristTitel, sitzungStatusLabel, ModuleKey, Betriebsvereinbarung,
  QualifikationsMatrix, Schulungstermin, Benutzer, Geschlecht,
} from "../lib/api";

// Vorlauf, ab dem auslaufende BVs bzw. Qualifikationen auf dem Dashboard auftauchen
const VORLAUF_TAGE = 90;

// ── Überblick-Karte ("Auf einen Blick") ───────────────────────────
function UeberblickKarte({ icon, titel, ton, href, children }: {
  icon: React.ReactElement; titel: string; ton: "ok" | "warnung" | "neutral"; href?: string;
  children: React.ReactNode;
}) {
  const rand: Record<string, string> = {
    ok:      "border-l-green-500",
    warnung: "border-l-amber-500",
    neutral: "border-l-gray-300",
  };
  const inner = (
    <div className={`bg-white rounded-xl border border-gray-100 border-l-4 ${rand[ton]} shadow-sm p-4 h-full hover:shadow-md transition-shadow`}>
      <div className="flex items-center gap-2 mb-2 text-gray-500">
        {icon}
        <h2 className="text-xs font-semibold uppercase tracking-wide">{titel}</h2>
      </div>
      <div className="text-sm text-gray-700 space-y-1">{children}</div>
    </div>
  );
  return href ? <Link to={href} className="block">{inner}</Link> : inner;
}

// ── Stat-Karte ────────────────────────────────────────────────────
function StatKarte({ icon, titel, wert, sub, farbe, href }: {
  icon: React.ReactElement; titel: string; wert: number | string;
  sub?: string; farbe: "blue" | "red" | "amber" | "indigo"; href?: string;
}) {
  const iconKlasse: Record<string, string> = {
    blue:   "text-accent bg-accent/5",
    red:    "text-red-600 bg-red-50",
    amber:  "text-amber-600 bg-amber-50",
    indigo: "text-accent bg-accent/5",
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
  const [alleFristen, setAlleFristen] = useState<FristMitDokument[]>([]);
  const [module, setModule]       = useState<Record<ModuleKey, boolean> | null>(null);
  const [bvs, setBvs]             = useState<Betriebsvereinbarung[]>([]);
  const [matrix, setMatrix]       = useState<QualifikationsMatrix | null>(null);
  const [geplanteSchulungen, setGeplanteSchulungen] = useState<Schulungstermin[]>([]);
  const [benutzer, setBenutzer]   = useState<Benutzer[]>([]);
  const [quote, setQuote]         = useState<{ minderheitengeschlecht: Geschlecht | null; mindestsitzeMinderheit: number } | null>(null);
  const navigate = useNavigate();
  const [laden, setLaden]         = useState(true);
  const [meinVorname, setMeinVorname] = useState("");

  useEffect(() => {
    Promise.all([
      api.dokumente.liste(),
      api.dokumente.inbox().catch(() => [] as Dokument[]), // nur Vorsitz/Stellvertreter/Admin dürfen das
      api.sitzungen.liste(),
      api.aufgaben.liste().catch(() => [] as Aufgabe[]),
      api.watchfolder.log().catch(() => [] as WatchfolderLogEintrag[]),
      // Direkt aus der Fristen-API, damit auch Fristen ohne Dokument erscheinen
      api.fristen.liste({ status: "OFFEN" }).catch(() => [] as FristMitDokument[]),
    ]).then(([docs, inbox, sits, aufg, wlog, fristen]) => {
      setAlleFristen(fristen);
      setDokumente(docs);
      setInboxDoks(inbox);
      setSitzungen(sits);
      setAufgaben(aufg);
      setWatchLog(wlog);
    }).catch(console.error).finally(() => setLaden(false));
    api.auth.me().then(b => setMeinVorname(b.name.split(" ")[0])).catch(() => {});

    // "Auf einen Blick": jede Quelle einzeln, damit ein fehlendes Recht oder abgeschaltetes Modul
    // nur die eine Karte ausblendet statt das ganze Dashboard
    api.einstellungen.module().then(m => {
      setModule(m);
      if (m.betriebsvereinbarungen !== false) api.betriebsvereinbarungen.liste().then(setBvs).catch(() => {});
      if (m.personalverwaltung !== false) {
        api.schulungen.matrix().then(setMatrix).catch(() => {});
        api.schulungen.liste({ status: "GEPLANT" }).then(setGeplanteSchulungen).catch(() => {});
      }
    }).catch(() => {});
    api.get<Benutzer[]>("/api/benutzer").then(setBenutzer).catch(() => {});
    api.einstellungen.wahlquote().then(setQuote).catch(() => {});
  }, []);

  async function fristErledigen(id: string) {
    try {
      await api.fristen.aktualisieren(id, { erledigt: true });
      setAlleFristen(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

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

  // ── Auf einen Blick ──────────────────────────────────────────────
  const bvAuslaufend = bvs
    .filter(b => b.status === "AKTIV" && b.laufzeitEnde && tageVergangen(b.laufzeitEnde) <= VORLAUF_TAGE)
    .sort((a, b) => new Date(a.laufzeitEnde!).getTime() - new Date(b.laufzeitEnde!).getTime());
  const bvGekuendigt = bvs.filter(b => b.status === "GEKUENDIGT");

  const qualiZellen     = matrix?.zeilen.flatMap(z => z.zellen) ?? [];
  const qualiAbgelaufen = qualiZellen.filter(z => z.status === "ABGELAUFEN").length;
  const qualiLaeuftAb   = qualiZellen.filter(z =>
    z.status === "GUELTIG" && z.gueltigBis && tageVergangen(z.gueltigBis) <= VORLAUF_TAGE).length;
  const naechsteSchulung = geplanteSchulungen
    .filter(t => tageVergangen(t.datum) >= 0)
    .sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())[0];

  // Quote nach § 15 Abs. 2: zählt die aktuell gewählten ordentlichen Mitglieder
  const gremium = benutzer.filter(b => b.aktiv && ["VORSITZ", "STELLVERTRETER", "MITGLIED"].includes(b.rolle));
  const quoteAktiv = !!quote?.minderheitengeschlecht && quote.mindestsitzeMinderheit > 0;
  const minderheitSitze = quoteAktiv ? gremium.filter(b => b.geschlecht === quote!.minderheitengeschlecht).length : 0;
  const ohneGeschlecht  = gremium.filter(b => !b.geschlecht).length;

  const ungelesen      = inboxDoks.filter(d => !d.inboxGelesen).length;
  // Themen aus dem Kanban-Backlog zählen hier nicht mit – das sind Ideen, keine ToDos
  // Nur eigenständige ToDos (wie auf der "Aufgaben"-Seite) – keine Zeitraum-Einträge/-Kinder
  const offeneAufgaben = aufgaben.filter(a => !a.erledigt && a.typ === "AUFGABE" && a.kanbanStatus == null);
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

      {/* ── Auf einen Blick ───────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <UeberblickKarte
          icon={<CalendarDays size={15} />} titel="Nächste Sitzung"
          ton={naechsteSitzung ? "neutral" : "warnung"}
          href={naechsteSitzung ? `/sitzungen?id=${naechsteSitzung.id}` : "/sitzungen"}
        >
          {naechsteSitzung ? (
            <>
              <p className="font-semibold text-gray-900 truncate">{naechsteSitzung.titel}</p>
              <p>
                {new Date(naechsteSitzung.sitzungsdatum).toLocaleString("de-DE", {
                  weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                })} Uhr{naechsteSitzung.ort ? ` · ${naechsteSitzung.ort}` : ""}
              </p>
              <p className="text-xs text-gray-400">
                {naechsteSitzung._count.tops} TOPs · {sitzungStatusLabel(naechsteSitzung.status, naechsteSitzung.sitzungstyp)}
              </p>
            </>
          ) : (
            <p>Keine Sitzung geplant</p>
          )}
        </UeberblickKarte>

        {module?.betriebsvereinbarungen !== false && (
          <UeberblickKarte
            icon={<Scale size={15} />} titel="Betriebsvereinbarungen"
            ton={bvAuslaufend.length + bvGekuendigt.length > 0 ? "warnung" : "ok"}
            href="/betriebsvereinbarungen"
          >
            {bvAuslaufend.length === 0 && bvGekuendigt.length === 0 && (
              <p>Keine läuft in den nächsten {VORLAUF_TAGE} Tagen aus</p>
            )}
            {bvAuslaufend.slice(0, 2).map(b => (
              <p key={b.id} className="flex justify-between gap-2">
                <span className="truncate">{b.titel}</span>
                <span className="shrink-0 text-xs text-amber-700">{formatDatum(b.laufzeitEnde!)}</span>
              </p>
            ))}
            {bvAuslaufend.length > 2 && <p className="text-xs text-gray-400">+ {bvAuslaufend.length - 2} weitere</p>}
            {bvGekuendigt.length > 0 && (
              <p className="text-xs text-gray-500">{bvGekuendigt.length} gekündigt (Nachwirkung/Neuverhandlung)</p>
            )}
          </UeberblickKarte>
        )}

        {module?.personalverwaltung !== false && matrix && (
          <UeberblickKarte
            icon={<GraduationCap size={15} />} titel="Schulungen"
            ton={qualiAbgelaufen + qualiLaeuftAb > 0 ? "warnung" : "ok"}
            href="/schulungen"
          >
            {qualiAbgelaufen > 0 && <p><span className="font-semibold text-red-600">{qualiAbgelaufen}</span> Qualifikationen abgelaufen</p>}
            {qualiLaeuftAb > 0 && <p><span className="font-semibold text-amber-700">{qualiLaeuftAb}</span> laufen in {VORLAUF_TAGE} Tagen ab</p>}
            {qualiAbgelaufen + qualiLaeuftAb === 0 && <p>Alle Qualifikationen gültig</p>}
            <p className="text-xs text-gray-400 truncate">
              {naechsteSchulung
                ? `Nächster Termin: ${formatDatum(naechsteSchulung.datum)} · ${naechsteSchulung.titel ?? naechsteSchulung.qualifikation.name}`
                : "Kein Schulungstermin geplant"}
            </p>
          </UeberblickKarte>
        )}

        {quoteAktiv && (
          <UeberblickKarte
            icon={<Users size={15} />} titel="Geschlechterquote"
            ton={minderheitSitze >= quote!.mindestsitzeMinderheit ? "ok" : "warnung"}
          >
            <p>
              <span className="font-semibold text-gray-900">{minderheitSitze}</span> von mind.{" "}
              <span className="font-semibold text-gray-900">{quote!.mindestsitzeMinderheit}</span> Sitzen{" "}
              {quote!.minderheitengeschlecht === "WEIBLICH" ? "weiblich" : "männlich"}
            </p>
            <p className="text-xs text-gray-400">
              {minderheitSitze >= quote!.mindestsitzeMinderheit
                ? `Erfüllt (§ 15 Abs. 2 BetrVG) · ${gremium.length} ordentliche Mitglieder`
                : "Unterschritten – beim Nachrücken auf die Quote achten"}
            </p>
            {ohneGeschlecht > 0 && <p className="text-xs text-amber-700">{ohneGeschlecht} Mitglied(er) ohne Angabe zum Geschlecht</p>}
          </UeberblickKarte>
        )}
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
                  <li key={f.id} className="px-5 py-3 hover:bg-gray-50 transition-colors group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          onClick={() => f.dokument ? navigate("/dokumente", { state: { markiere: f.dokument.id } }) : navigate("/fristen")}
                          className="text-left text-sm font-medium text-gray-900 hover:text-[rgb(var(--accent))] truncate block max-w-full"
                        >
                          {fristTitel(f)}
                        </button>
                        <p className="text-xs text-gray-400 mt-0.5">{FRIST_TYP_LABEL[f.typ] ?? f.typ}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => fristErledigen(f.id)}
                          title="Als erledigt markieren"
                          className="text-gray-300 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <CheckCircle size={15} />
                        </button>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${fristFarbe(f.faelligAm)}`}>
                          {tage < 0 ? `${Math.abs(tage)}T übf.` : tage === 0 ? "Heute" : `${tage}T`}
                        </span>
                      </div>
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
