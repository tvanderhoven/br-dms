import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, Clock, CheckCircle, Circle, Inbox, CalendarDays, XCircle, ClipboardList,
  Scale, GraduationCap, Users, Trash2, Mail,
} from "lucide-react";
import {
  api, Dokument, FristMitDokument, SitzungListItem, Aufgabe, WatchfolderLogEintrag, fristFarbe, formatDatum,
  FRIST_TYP_LABEL, fristTitel, sitzungStatusLabel, ModuleKey, Betriebsvereinbarung,
  QualifikationsMatrix, Schulungstermin, Benutzer, Geschlecht, Nachricht,
} from "../lib/api";

// Vorlauf, ab dem auslaufende BVs bzw. Qualifikationen auf dem Dashboard auftauchen
const VORLAUF_TAGE = 90;
// Fristen-Widget: überfällige + die nächsten 14 Tage, höchstens 6 Zeilen
const FRISTEN_TAGE = 14;
const FRISTEN_MAX  = 6;

const PRIO_SORT: Record<string, number> = { HOCH: 0, MITTEL: 1, NIEDRIG: 2 };
const PRIO_PUNKT: Record<string, string> = {
  HOCH:    "text-red-500",
  MITTEL:  "text-amber-500",
  NIEDRIG: "text-gray-300",
};

const tageBis = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

// Fällige zuerst, ohne Datum ans Ende; bei gleichem Datum nach Priorität
function aufgabenSortierung(a: Aufgabe, b: Aufgabe): number {
  const ta = a.faelligAm ? new Date(a.faelligAm).getTime() : Infinity;
  const tb = b.faelligAm ? new Date(b.faelligAm).getTime() : Infinity;
  if (ta !== tb) return ta - tb;
  return PRIO_SORT[a.prioritaet] - PRIO_SORT[b.prioritaet];
}

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

// ── Eine Aufgabenzeile ─────────────────────────────────────────────
function AufgabeZeile({ aufgabe, mitName, onErledigt }: {
  aufgabe: Aufgabe; mitName: boolean; onErledigt?: () => void;
}) {
  return (
    <li className="px-5 py-2 flex items-center gap-3 hover:bg-gray-50 transition-colors group">
      {onErledigt ? (
        <button onClick={onErledigt} title="Als erledigt markieren" className="shrink-0 text-gray-300 hover:text-green-600">
          <Circle size={16} className="group-hover:hidden" />
          <CheckCircle size={16} className="hidden group-hover:block" />
        </button>
      ) : (
        <span className={`shrink-0 text-[10px] leading-none ${PRIO_PUNKT[aufgabe.prioritaet]}`} title={`Priorität ${aufgabe.prioritaet}`}>●</span>
      )}
      <div className="min-w-0 flex-1 flex items-baseline gap-2">
        {mitName && (
          <span className={`shrink-0 text-xs ${aufgabe.zugewiesenAn ? "text-gray-500" : "text-amber-700"}`}>
            {aufgabe.zugewiesenAn?.name ?? "nicht zugewiesen"}:
          </span>
        )}
        <span className="text-sm text-gray-900 truncate" title={aufgabe.titel}>{aufgabe.titel}</span>
        {onErledigt && aufgabe.prioritaet === "HOCH" && (
          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">HOCH</span>
        )}
      </div>
      {aufgabe.faelligAm && (
        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full border ${fristFarbe(aufgabe.faelligAm)}`}>
          {formatDatum(aufgabe.faelligAm)}
        </span>
      )}
    </li>
  );
}

export default function Dashboard() {
  const [dokumente, setDokumente] = useState<Dokument[]>([]);
  const [inboxDoks, setInboxDoks] = useState<Dokument[]>([]);
  const [sitzungen, setSitzungen] = useState<SitzungListItem[]>([]);
  const [aufgaben, setAufgaben]   = useState<Aufgabe[]>([]);
  const [watchLog, setWatchLog]   = useState<WatchfolderLogEintrag[]>([]);
  const [alleFristen, setAlleFristen] = useState<FristMitDokument[]>([]);
  const [ungeleseneNachrichten, setUngeleseneNachrichten] = useState<Nachricht[]>([]);
  const [module, setModule]       = useState<Record<ModuleKey, boolean> | null>(null);
  const [bvs, setBvs]             = useState<Betriebsvereinbarung[]>([]);
  const [matrix, setMatrix]       = useState<QualifikationsMatrix | null>(null);
  const [geplanteSchulungen, setGeplanteSchulungen] = useState<Schulungstermin[]>([]);
  const [benutzer, setBenutzer]   = useState<Benutzer[]>([]);
  const [quote, setQuote]         = useState<{ minderheitengeschlecht: Geschlecht | null; mindestsitzeMinderheit: number } | null>(null);
  const navigate = useNavigate();
  const [laden, setLaden]         = useState(true);
  const [ich, setIch]             = useState<{ id: string; vorname: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api.dokumente.liste(),
      api.dokumente.inbox().catch(() => [] as Dokument[]), // nur Vorsitz/Stellvertreter/Admin dürfen das
      api.sitzungen.liste(),
      api.aufgaben.liste().catch(() => [] as Aufgabe[]),
      api.watchfolder.log().catch(() => [] as WatchfolderLogEintrag[]),
      // Direkt aus der Fristen-API, damit auch Fristen ohne Dokument erscheinen
      api.fristen.liste({ status: "OFFEN" }).catch(() => [] as FristMitDokument[]),
      api.nachrichten.ungelesen().catch(() => [] as Nachricht[]),
    ]).then(([docs, inbox, sits, aufg, wlog, fristen, nachr]) => {
      setAlleFristen(fristen);
      setDokumente(docs);
      setInboxDoks(inbox);
      setSitzungen(sits);
      setAufgaben(aufg);
      setWatchLog(wlog);
      setUngeleseneNachrichten(nachr);
    }).catch(console.error).finally(() => setLaden(false));
    api.auth.me().then(b => setIch({ id: b.id, vorname: b.name.split(" ")[0] })).catch(() => {});

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

  async function aufgabeErledigen(id: string) {
    try {
      await api.aufgaben.aktualisieren(id, { erledigt: true });
      setAufgaben(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  // ── Auf einen Blick ──────────────────────────────────────────────
  const heute = new Date();
  const naechsteSitzung = sitzungen
    .filter(s => new Date(s.sitzungsdatum) >= heute && s.status !== "ABGESAGT")
    .sort((a, b) => new Date(a.sitzungsdatum).getTime() - new Date(b.sitzungsdatum).getTime())[0];

  const bvAuslaufend = bvs
    .filter(b => b.status === "AKTIV" && b.laufzeitEnde && tageBis(b.laufzeitEnde) <= VORLAUF_TAGE)
    .sort((a, b) => new Date(a.laufzeitEnde!).getTime() - new Date(b.laufzeitEnde!).getTime());
  const bvGekuendigt = bvs.filter(b => b.status === "GEKUENDIGT");

  const qualiZellen     = matrix?.zeilen.flatMap(z => z.zellen) ?? [];
  const qualiAbgelaufen = qualiZellen.filter(z => z.status === "ABGELAUFEN").length;
  const qualiLaeuftAb   = qualiZellen.filter(z =>
    z.status === "GUELTIG" && z.gueltigBis && tageBis(z.gueltigBis) <= VORLAUF_TAGE).length;
  const naechsteSchulung = geplanteSchulungen
    .filter(t => tageBis(t.datum) >= 0)
    .sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())[0];

  // Quote nach § 15 Abs. 2: zählt die aktuell gewählten ordentlichen Mitglieder
  const gremium = benutzer.filter(b => b.aktiv && ["VORSITZ", "STELLVERTRETER", "MITGLIED"].includes(b.rolle));
  const quoteAktiv = !!quote?.minderheitengeschlecht && quote.mindestsitzeMinderheit > 0;
  const minderheitSitze = quoteAktiv ? gremium.filter(b => b.geschlecht === quote!.minderheitengeschlecht).length : 0;
  const ohneGeschlecht  = gremium.filter(b => !b.geschlecht).length;

  // ── Aufgaben: für mich / alle anderen ───────────────────────────
  // Nur eigenständige ToDos (wie auf der "Aufgaben"-Seite) – keine Vorhaben und keine Themen aus dem Backlog
  const offeneAufgaben = aufgaben.filter(a => !a.erledigt && a.typ === "AUFGABE" && a.kanbanStatus == null);
  const fuerMich   = offeneAufgaben.filter(a => a.zugewiesenAn?.id === ich?.id).sort(aufgabenSortierung);
  const fuerAndere = offeneAufgaben.filter(a => a.zugewiesenAn?.id !== ich?.id).sort(aufgabenSortierung);

  // ── Fristen kompakt ─────────────────────────────────────────────
  const fristenNah = [...alleFristen]
    .sort((a, b) => new Date(a.faelligAm).getTime() - new Date(b.faelligAm).getTime())
    .filter(f => tageBis(f.faelligAm) <= FRISTEN_TAGE);
  const ueberfaellig = fristenNah.filter(f => tageBis(f.faelligAm) < 0).length;
  const kritisch     = fristenNah.filter(f => { const t = tageBis(f.faelligAm); return t >= 0 && t <= 3; }).length;

  // ── Hinweise (nur wenn etwas ansteht) ───────────────────────────
  const baldGeloescht = dokumente
    .filter(d => d.deleteAt && tageBis(d.deleteAt) <= 30 && tageBis(d.deleteAt) >= 0)
    .sort((a, b) => new Date(a.deleteAt!).getTime() - new Date(b.deleteAt!).getTime());
  const watchFehler = watchLog.filter(e => e.aktion === "WATCHFOLDER_FEHLER" && tageBis(e.zeitpunkt) >= -7);

  const ungelesen = inboxDoks.filter(d => !d.inboxGelesen).length;

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
            {ich ? `Hallo, ${ich.vorname}` : "Dashboard"}
          </h1>
        </div>
        <Link to="/eingang" className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 transition-colors rounded-lg px-3 py-1.5 text-sm">
          <Inbox size={14} className="text-gray-500" />
          <span className="font-semibold text-gray-800">{ungelesen}</span>
          <span className="text-gray-500 text-xs">im Eingang</span>
        </Link>
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

      {/* ── Hinweise: nur sichtbar, wenn etwas ansteht ──────────────── */}
      {(baldGeloescht.length > 0 || watchFehler.length > 0) && (
        <div className="space-y-2">
          {baldGeloescht.length > 0 && (
            <Link to="/dokumente" className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
              <Trash2 size={14} className="shrink-0" />
              <span className="truncate">
                {baldGeloescht.length === 1 ? "1 Dokument wird" : `${baldGeloescht.length} Dokumente werden`} in den nächsten 30 Tagen
                automatisch gelöscht – zuerst „{baldGeloescht[0].alias ?? baldGeloescht[0].titel}“ am {formatDatum(baldGeloescht[0].deleteAt!)}
              </span>
            </Link>
          )}
          {watchFehler.length > 0 && (
            <Link to="/einstellungen" className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-2 text-sm text-red-700 hover:bg-red-100 transition-colors">
              <XCircle size={14} className="shrink-0" />
              <span className="truncate">
                Watch-Folder: {watchFehler.length} fehlerhafte {watchFehler.length === 1 ? "Datei" : "Dateien"} in den letzten 7 Tagen –
                Details unter Einstellungen → System
              </span>
            </Link>
          )}
        </div>
      )}

      {/* ── Aufgaben + Fristen ────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-5 items-start">

        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList size={15} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900 text-sm">Aufgaben</h2>
            </div>
            <Link to="/aufgaben" className="text-xs text-[rgb(var(--accent))] hover:underline">Alle anzeigen →</Link>
          </div>

          <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Für mich <span className="text-gray-400 font-normal normal-case">({fuerMich.length})</span>
          </p>
          {fuerMich.length === 0 ? (
            <p className="px-5 py-3 text-sm text-gray-400 flex items-center gap-2">
              <CheckCircle size={15} className="text-green-400" /> Nichts offen für dich
            </p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {fuerMich.slice(0, 8).map(a => (
                <AufgabeZeile key={a.id} aufgabe={a} mitName={false} onErledigt={() => aufgabeErledigen(a.id)} />
              ))}
              {fuerMich.length > 8 && <li className="px-5 py-2 text-xs text-gray-400">+ {fuerMich.length - 8} weitere</li>}
            </ul>
          )}

          <p className="px-5 pt-4 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide border-t border-gray-50">
            Alle anderen <span className="text-gray-400 font-normal normal-case">({fuerAndere.length})</span>
          </p>
          {fuerAndere.length === 0 ? (
            <p className="px-5 py-3 text-sm text-gray-400">Keine offenen Aufgaben</p>
          ) : (
            <ul className="divide-y divide-gray-50 pb-2">
              {fuerAndere.slice(0, 6).map(a => <AufgabeZeile key={a.id} aufgabe={a} mitName />)}
              {fuerAndere.length > 6 && <li className="px-5 py-2 text-xs text-gray-400">+ {fuerAndere.length - 6} weitere</li>}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900 text-sm">Fristen</h2>
            </div>
            {ueberfaellig + kritisch > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                <AlertTriangle size={11} />
                {ueberfaellig > 0 ? `${ueberfaellig} überfällig` : `${kritisch} kritisch`}
              </span>
            )}
          </div>
          {fristenNah.length === 0 ? (
            <div className="px-5 py-6 text-center text-gray-400 text-sm">
              <CheckCircle className="mx-auto mb-2 text-green-400" size={22} />
              Keine Fristen in den nächsten {FRISTEN_TAGE} Tagen
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {fristenNah.slice(0, FRISTEN_MAX).map(f => {
                const tage = tageBis(f.faelligAm);
                return (
                  <li key={f.id} className="px-5 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors group">
                    <button
                      onClick={() => f.dokument ? navigate("/dokumente", { state: { markiere: f.dokument.id } }) : navigate("/fristen")}
                      title={`${fristTitel(f)} · ${FRIST_TYP_LABEL[f.typ] ?? f.typ} · ${formatDatum(f.faelligAm)}`}
                      className="min-w-0 flex-1 text-left text-sm text-gray-900 hover:text-[rgb(var(--accent))] truncate"
                    >
                      {fristTitel(f)}
                    </button>
                    <button
                      onClick={() => fristErledigen(f.id)}
                      title="Als erledigt markieren"
                      className="shrink-0 text-gray-300 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <CheckCircle size={14} />
                    </button>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${fristFarbe(f.faelligAm)}`}>
                      {tage < 0 ? `${Math.abs(tage)}T übf.` : tage === 0 ? "Heute" : `${tage}T`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <Link to="/fristen" className="block px-5 py-2.5 border-t border-gray-50 text-xs text-[rgb(var(--accent))] hover:underline">
            {fristenNah.length > FRISTEN_MAX
              ? `+ ${fristenNah.length - FRISTEN_MAX} weitere · alle im Fristenkalender →`
              : "Alle im Fristenkalender →"}
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail size={15} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900 text-sm">Nachrichten</h2>
            </div>
            {ungeleseneNachrichten.length > 0 && (
              <span className="text-xs font-medium text-white bg-[rgb(var(--accent))] px-2 py-0.5 rounded-full">
                {ungeleseneNachrichten.length} ungelesen
              </span>
            )}
          </div>
          {ungeleseneNachrichten.length === 0 ? (
            <p className="px-5 py-6 text-center text-gray-400 text-sm">Keine ungelesenen Nachrichten</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {ungeleseneNachrichten.slice(0, 4).map(n => (
                <li key={n.id}>
                  <Link to="/posteingang" className="px-5 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors block">
                    <span className="min-w-0 flex-1 text-sm text-gray-900 truncate" title={n.betreff}>{n.betreff}</span>
                    <span className="shrink-0 text-xs text-gray-400">{n.absender?.name ?? "System"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/posteingang" className="block px-5 py-2.5 border-t border-gray-50 text-xs text-[rgb(var(--accent))] hover:underline">
            {ungeleseneNachrichten.length > 4 ? `+ ${ungeleseneNachrichten.length - 4} weitere · alle Nachrichten →` : "Alle Nachrichten →"}
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
}
