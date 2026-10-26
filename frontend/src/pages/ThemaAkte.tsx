/**
 * Themenakte – ein Thema als roter Faden (Backend: routes/themenakte.ts, lib/themenakte.ts)
 *
 * Kopf: Status, Zuständige/Projektteam, nächster Schritt und Termin, Vertraulichkeit.
 * Verlauf: Beiträge (nicht veränderbar, Korrektur als neuer Beitrag mit Bezug, Rückfragen als
 * Kommentare daneben) und automatische Einträge aus Dokumenten, TOPs, Aufgaben und BVs.
 * Keine Abstimmung hier – beschlossen wird in der Sitzung, dafür „Als TOP vormerken“.
 */

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Pin, PinOff, Reply, MessageSquare, Printer, Trash2, Lock, Users, Plus, X, Loader2,
  FileText, ListChecks, CalendarCheck, Handshake, Bot, Link2, Unlink, Pencil, Check,
} from "lucide-react";
import {
  api, Benutzer, SitzungListItem, Sitzung, formatDatum,
  ThemaDetail, ThemaVerlauf, ThemaBeitrag, ThemaAutoEintrag, ThemaEintragArt, ThemaStatus, ThemaVertraulichkeit,
  ThemaVerknuepfung, Betriebsvereinbarung, THEMA_STATUS_LABEL, THEMA_VERTRAULICHKEIT_LABEL, THEMA_EINTRAG_LABEL,
} from "../lib/api";
import SitzungsEditor, { DokumentPickerModal } from "../components/SitzungsEditor";
import KommentarBlock from "../components/KommentarBlock";
import { tiptapZuHtml, tiptapZuText } from "../lib/tiptap";

const eingabe = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]";
const knopf   = "flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const haupt   = "flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg";

const ART_FARBE: Record<ThemaEintragArt, string> = {
  NOTIZ: "bg-gray-100 text-gray-700", GESPRAECHSVERMERK: "bg-blue-100 text-blue-800",
  IDEE_FRAGE: "bg-amber-100 text-amber-800", RECHERCHE: "bg-emerald-100 text-emerald-800",
};
const AUTO_ICON: Record<ThemaAutoEintrag["art"], ReactNode> = {
  DOKUMENT: <FileText size={13} />, FRIST: <CalendarCheck size={13} />, TOP: <ListChecks size={13} />,
  BESCHLUSS: <Check size={13} />, AUFGABE: <ListChecks size={13} />, BV: <Handshake size={13} />,
};

const zeit = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fehlerText = (e: unknown) => (e instanceof Error ? e.message : "Fehler");

// PDF im neuen Tab – mit Token, darum per fetch statt Link (wie Kosten.tsx)
function pdfOeffnen(url: string) {
  const tab = window.open("", "_blank");
  const token = localStorage.getItem("brdms_token");
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
    .then(blob => {
      const objectUrl = URL.createObjectURL(blob);
      if (tab) tab.location.href = objectUrl;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    })
    .catch(() => { tab?.close(); alert("PDF konnte nicht erzeugt werden"); });
}

export default function ThemaAkte() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [thema, setThema]       = useState<ThemaDetail | null>(null);
  const [verlauf, setVerlauf]   = useState<ThemaVerlauf | null>(null);
  const [benutzer, setBenutzer] = useState<Benutzer[]>([]);
  const [fehler, setFehler]     = useState("");
  const [dialog, setDialog]     = useState<null | "kopf" | "beteiligte" | "dokument" | "top" | "top-vorhanden" | "aufgabe" | "bv">(null);
  const [bezug, setBezug]       = useState<ThemaBeitrag | null>(null);
  const [mitAuto, setMitAuto]   = useState(true);

  function laden() {
    api.themenakte.einzel(id).then(setThema).catch(e => setFehler(fehlerText(e)));
    api.themenakte.verlauf(id).then(setVerlauf).catch(() => {});
  }
  useEffect(() => {
    laden();
    api.get<Benutzer[]>("/api/benutzer").then(b => setBenutzer(b.filter(u => u.aktiv))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Wer beteiligt bzw. erwähnt werden kann: Gremium (JAV/SBV/Externe erreichen die Akte noch nicht)
  const gremium = useMemo(
    () => benutzer.filter(b => ["VORSITZ", "STELLVERTRETER", "MITGLIED", "ERSATZMITGLIED"].includes(b.rolle)),
    [benutzer],
  );

  async function aendern(data: Parameters<typeof api.themenakte.aendern>[1]) {
    try {
      await api.themenakte.aendern(id, data);
      laden();
    } catch (e) {
      alert(fehlerText(e));
    }
  }

  async function verknuepfen(typ: ThemaVerknuepfung, zielId: string) {
    try {
      await api.themenakte.verknuepfen(id, typ, zielId);
      setDialog(null);
      laden();
    } catch (e) {
      alert(fehlerText(e));
    }
  }

  async function loesen(typ: ThemaVerknuepfung, zielId: string) {
    if (!confirm("Verknüpfung mit dem Thema lösen? Das Objekt selbst bleibt erhalten.")) return;
    try {
      await api.themenakte.loesen(id, typ, zielId);
      laden();
    } catch (e) {
      alert(fehlerText(e));
    }
  }

  async function themaLoeschen() {
    if (!thema || !confirm(`Thema „${thema.titel}“ mit allen Beiträgen endgültig löschen? Verknüpfte Dokumente, TOPs und Aufgaben bleiben erhalten.`)) return;
    try {
      await api.themenakte.loeschen(id);
      navigate("/themen-backlog");
    } catch (e) {
      alert(fehlerText(e));
    }
  }

  if (!thema) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        {fehler ? <span className="text-red-700">{fehler}</span> : <><Loader2 size={16} className="animate-spin" /> Laden…</>}
      </div>
    );
  }

  const r = thema.rechte;
  const zustaendig = thema.beteiligte.filter(b => b.zustaendig);
  const team = thema.beteiligte.filter(b => !b.zustaendig);

  return (
    <div className="p-6 max-w-6xl">
      <Link to="/themen-backlog" className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-3">
        <ArrowLeft size={14} /> Themen-Backlog
      </Link>

      {/* Kopf */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 wrap-break-word flex items-center gap-2">
            {thema.vertraulichkeit !== "ALLE" && <Lock size={18} className="text-amber-600 shrink-0" />}
            {thema.titel}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Angelegt von {thema.erstelltVon.name} am {formatDatum(thema.erstelltAm)} · {THEMA_VERTRAULICHKEIT_LABEL[thema.vertraulichkeit]}
            {thema.nurTeam && " · nur Projektteam schreibt"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={thema.status}
            disabled={!r.schreiben}
            onChange={e => aendern({ status: e.target.value as ThemaStatus })}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm disabled:opacity-60"
            aria-label="Status"
          >
            {(Object.keys(THEMA_STATUS_LABEL) as ThemaStatus[]).map(s => <option key={s} value={s}>{THEMA_STATUS_LABEL[s]}</option>)}
          </select>
          {r.schreiben && <button onClick={() => setDialog("kopf")} className={knopf}><Pencil size={14} /> Bearbeiten</button>}
          <button onClick={() => pdfOeffnen(api.themenakte.chronikUrl(id))} className={knopf} title="Chronik als PDF, z. B. für die Amtsübergabe">
            <Printer size={14} /> Chronik
          </button>
          {r.verwalten && (
            <button onClick={themaLoeschen} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Thema löschen">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Verlauf */}
        <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">
          {r.schreiben && verlauf && (
            <BeitragSchreiben themaId={id} personen={gremium} bezug={bezug} onBezugWeg={() => setBezug(null)} onGespeichert={() => { setBezug(null); laden(); }} />
          )}
          {!r.schreiben && (
            <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              {thema.nurTeam ? "In dieses Thema schreibt nur das Projektteam." : "Du kannst dieses Thema lesen, aber keine Beiträge schreiben."}
            </p>
          )}
          {verlauf ? (
            <Verlauf
              themaId={id}
              verlauf={verlauf}
              mitAuto={mitAuto}
              onMitAuto={setMitAuto}
              darfSchreiben={r.schreiben}
              onBeziehen={b => { setBezug(b); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              onAnheften={async (b) => { await api.themenakte.anheften(id, b.id, !b.angeheftet).catch(e => alert(fehlerText(e))); laden(); }}
            />
          ) : (
            <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Verlauf wird geladen…</p>
          )}
        </div>

        {/* Seitenleiste */}
        <div className="space-y-4 order-1 lg:order-2">
          <Karte titel="Überblick">
            <dl className="text-sm space-y-2.5">
              <div>
                <dt className="text-xs text-gray-500">Nächster Schritt</dt>
                <dd className="text-gray-800">
                  {thema.naechsterSchritt ?? <span className="text-gray-400">–</span>}
                  {thema.naechsterTermin && (
                    <span className={`block text-xs ${new Date(thema.naechsterTermin) < new Date() && thema.status !== "ABGESCHLOSSEN" ? "text-red-700" : "text-gray-500"}`}>
                      bis {formatDatum(thema.naechsterTermin)}
                    </span>
                  )}
                </dd>
              </div>
              {thema.beschreibung && (
                <div>
                  <dt className="text-xs text-gray-500">Worum es geht</dt>
                  <dd className="text-gray-800 whitespace-pre-wrap">{thema.beschreibung}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-gray-500 flex items-center justify-between">
                  Zuständig / Projektteam
                  {r.schreiben && <button onClick={() => setDialog("beteiligte")} className="text-[rgb(var(--accent))] hover:underline">ändern</button>}
                </dt>
                <dd className="text-gray-800">
                  {zustaendig.length ? zustaendig.map(b => b.benutzer.name).join(", ") : <span className="text-gray-400">niemand</span>}
                  {team.length > 0 && <span className="block text-xs text-gray-500 flex items-center gap-1"><Users size={11} /> {team.map(b => b.benutzer.name).join(", ")}</span>}
                </dd>
              </div>
            </dl>
          </Karte>

          <Karte titel="Verknüpft">
            <Verknuepfungsliste
              titel="Dokumente" leer="Keine Dokumente"
              eintraege={thema.dokumente.map(d => ({ id: d.id, text: d.alias ?? d.titel, unter: formatDatum(d.erstelltAm), link: `/dokumente?dokument=${d.id}`, vertraulich: d.vertraulich }))}
              onLoesen={r.schreiben ? x => loesen("DOKUMENT", x) : undefined}
              onHinzu={r.schreiben ? () => setDialog("dokument") : undefined}
            />
            <Verknuepfungsliste
              titel="TOPs" leer="Noch in keiner Sitzung"
              eintraege={thema.tops.map(t => ({ id: t.id, text: `TOP ${t.nummer} – ${t.titel}`, unter: `${t.sitzung.titel} · ${formatDatum(t.sitzung.sitzungsdatum)}`, link: `/sitzungen?id=${t.sitzung.id}`, vertraulich: t.vertraulich }))}
              onLoesen={r.schreiben ? x => loesen("TOP", x) : undefined}
              onHinzu={r.schreiben ? () => setDialog("top") : undefined}
              hinzuText="Als TOP vormerken"
              zusatz={r.schreiben ? <button onClick={() => setDialog("top-vorhanden")} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"><Link2 size={11} /> vorhandenen TOP verknüpfen</button> : null}
            />
            <Verknuepfungsliste
              titel="Aufgaben" leer="Keine Aufgaben"
              eintraege={thema.aufgaben.map(a => ({ id: a.id, text: a.titel, unter: [a.erledigt ? "erledigt" : a.faelligAm ? `fällig ${formatDatum(a.faelligAm)}` : null, a.zugewiesenAn?.name].filter(Boolean).join(" · "), link: `/aufgaben?aufgabe=${a.id}`, durchgestrichen: a.erledigt }))}
              onLoesen={r.schreiben ? x => loesen("AUFGABE", x) : undefined}
              onHinzu={r.schreiben ? () => setDialog("aufgabe") : undefined}
            />
            <Verknuepfungsliste
              titel="Betriebsvereinbarungen" leer="Keine"
              eintraege={thema.betriebsvereinbarungen.map(b => ({ id: b.id, text: b.titel, unter: `abgeschlossen ${formatDatum(b.abschlussdatum)}`, link: "/betriebsvereinbarungen" }))}
              onLoesen={r.schreiben ? x => loesen("BV", x) : undefined}
              onHinzu={r.schreiben ? () => setDialog("bv") : undefined}
            />
          </Karte>
          <p className="text-xs text-gray-400 px-1">
            Abgestimmt wird nicht in der Akte, sondern in der Sitzung (§ 33 BetrVG) – dafür „Als TOP vormerken“.
          </p>
        </div>
      </div>

      {dialog === "kopf" && <KopfDialog thema={thema} onSchliessen={() => setDialog(null)} onSpeichern={async d => { await aendern(d); setDialog(null); }} />}
      {dialog === "beteiligte" && (
        <BeteiligteDialog thema={thema} personen={gremium} onSchliessen={() => setDialog(null)} onSpeichern={async d => { await aendern(d); setDialog(null); }} />
      )}
      {dialog === "dokument" && (
        <DokumentPickerModal onSchliessen={() => setDialog(null)} onEinfuegen={a => verknuepfen("DOKUMENT", a.dokumentId)} />
      )}
      {dialog === "top" && <AlsTopDialog thema={thema} onSchliessen={() => setDialog(null)} onFertig={() => { setDialog(null); laden(); }} />}
      {dialog === "top-vorhanden" && <TopWaehlenDialog onSchliessen={() => setDialog(null)} onWahl={topId => verknuepfen("TOP", topId)} />}
      {dialog === "aufgabe" && <AufgabeDialog thema={thema} personen={gremium} onSchliessen={() => setDialog(null)} onFertig={() => { setDialog(null); laden(); }} />}
      {dialog === "bv" && <BvDialog onSchliessen={() => setDialog(null)} onWahl={bvId => verknuepfen("BV", bvId)} />}
    </div>
  );
}

// ── Verlauf ─────────────────────────────────────────────────────

type Zeile = { typ: "beitrag"; zeit: string; b: ThemaBeitrag } | { typ: "auto"; zeit: string; a: ThemaAutoEintrag };

function Verlauf({ themaId, verlauf, mitAuto, onMitAuto, darfSchreiben, onBeziehen, onAnheften }: {
  themaId: string; verlauf: ThemaVerlauf; mitAuto: boolean; onMitAuto: (v: boolean) => void; darfSchreiben: boolean;
  onBeziehen: (b: ThemaBeitrag) => void; onAnheften: (b: ThemaBeitrag) => void;
}) {
  const angeheftet = verlauf.beitraege.filter(b => b.angeheftet);
  // Neueste oben – angeheftete Beiträge stehen zusätzlich darüber
  const zeilen: Zeile[] = [
    ...verlauf.beitraege.map(b => ({ typ: "beitrag" as const, zeit: b.erstelltAm, b })),
    ...(mitAuto ? verlauf.automatisch.map(a => ({ typ: "auto" as const, zeit: a.zeit, a })) : []),
  ].sort((x, y) => new Date(y.zeit).getTime() - new Date(x.zeit).getTime());

  return (
    <div className="space-y-3">
      {angeheftet.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1"><Pin size={12} /> Angeheftet</h2>
          {angeheftet.map(b => (
            <BeitragKarte key={`pin-${b.id}`} themaId={themaId} b={b} darfSchreiben={darfSchreiben} onBeziehen={onBeziehen} onAnheften={onAnheften} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Verlauf</h2>
        <label className="text-xs text-gray-500 flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={mitAuto} onChange={e => onMitAuto(e.target.checked)} />
          automatische Einträge zeigen
        </label>
      </div>

      {zeilen.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">Noch nichts in der Akte.</p>}

      <ol className="space-y-2">
        {zeilen.map(z => z.typ === "beitrag" ? (
          <li key={z.b.id}>
            <BeitragKarte themaId={themaId} b={z.b} darfSchreiben={darfSchreiben} onBeziehen={onBeziehen} onAnheften={onAnheften} />
          </li>
        ) : (
          <li key={`${z.a.art}-${z.a.zeit}-${z.a.text}`} className="flex items-start gap-2 text-sm text-gray-600 px-3 py-1.5">
            <span className="text-gray-400 mt-0.5 shrink-0" title="automatischer Eintrag"><Bot size={13} /></span>
            <span className="text-gray-400 mt-0.5 shrink-0">{AUTO_ICON[z.a.art]}</span>
            <span className="flex-1 min-w-0">
              {z.a.link ? <Link to={z.a.link} className="hover:underline">{z.a.text}</Link> : z.a.text}
            </span>
            <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">{zeit(z.a.zeit)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BeitragKarte({ themaId, b, darfSchreiben, onBeziehen, onAnheften }: {
  themaId: string; b: ThemaBeitrag; darfSchreiben: boolean; onBeziehen: (b: ThemaBeitrag) => void; onAnheften: (b: ThemaBeitrag) => void;
}) {
  const [rueckfragen, setRueckfragen] = useState(false);
  const [anzahl, setAnzahl] = useState(b._count.kommentare);
  const basis = `/api/themenakte/${themaId}/eintraege/${b.id}/kommentare`;
  return (
    <div id={`beitrag-${b.id}`} className={`bg-white border rounded-xl px-4 py-3 ${b.angeheftet ? "border-amber-300" : "border-gray-200"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`px-1.5 py-0.5 rounded-full font-medium ${ART_FARBE[b.art]}`}>{THEMA_EINTRAG_LABEL[b.art]}</span>
        <span className="font-medium text-gray-800">{b.autor.name}</span>
        <span className="text-gray-400">{zeit(b.erstelltAm)}</span>
        {b.bezug && (
          <a href={`#beitrag-${b.bezug.id}`} className="text-gray-500 hover:underline flex items-center gap-1">
            <Reply size={11} /> Bezug: {THEMA_EINTRAG_LABEL[b.bezug.art]} von {b.bezug.autor.name}, {formatDatum(b.bezug.erstelltAm)}
          </a>
        )}
      </div>
      {b.inhaltJson ? (
        <div
          className="text-sm text-gray-800 mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic [&_h2]:font-bold [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_blockquote]:text-gray-500"
          dangerouslySetInnerHTML={{ __html: tiptapZuHtml(b.inhaltJson) }}
        />
      ) : (
        <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{b.inhalt}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
        <button onClick={() => setRueckfragen(!rueckfragen)} className="text-gray-500 hover:text-gray-800 flex items-center gap-1">
          <MessageSquare size={12} /> Rückfragen{anzahl > 0 && ` (${anzahl})`}
        </button>
        {darfSchreiben && (
          <>
            <button onClick={() => onBeziehen(b)} className="text-gray-500 hover:text-gray-800 flex items-center gap-1" title="Ergänzung oder Korrektur als neuer Beitrag">
              <Reply size={12} /> Darauf beziehen
            </button>
            <button onClick={() => onAnheften(b)} className="text-gray-500 hover:text-gray-800 flex items-center gap-1">
              {b.angeheftet ? <><PinOff size={12} /> Lösen</> : <><Pin size={12} /> Anheften</>}
            </button>
          </>
        )}
      </div>
      {rueckfragen && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <KommentarBlock compact ladeUrl={basis} erstellenUrl={basis} loeschenUrl={kid => `${basis}/${kid}`} onAnzahlAendert={setAnzahl} />
        </div>
      )}
    </div>
  );
}

function BeitragSchreiben({ themaId, personen, bezug, onBezugWeg, onGespeichert }: {
  themaId: string; personen: Benutzer[]; bezug: ThemaBeitrag | null; onBezugWeg: () => void; onGespeichert: () => void;
}) {
  const [art, setArt]   = useState<ThemaEintragArt>("NOTIZ");
  const [json, setJson] = useState<object | null>(null);
  const [senden, setSenden] = useState(false);
  const text = tiptapZuText(json).trim();

  async function absenden(e: FormEvent) {
    e.preventDefault();
    if (!text) return;
    if (!confirm("Beiträge lassen sich danach nicht mehr ändern – Korrekturen gehen nur als neuer Beitrag. Speichern?")) return;
    setSenden(true);
    try {
      await api.themenakte.beitrag(themaId, { art, inhalt: text, inhaltJson: json, bezugId: bezug?.id ?? null });
      setJson(null);
      setArt("NOTIZ");
      onGespeichert();
    } catch (err) {
      alert(fehlerText(err));
    } finally {
      setSenden(false);
    }
  }

  return (
    <form onSubmit={absenden} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(THEMA_EINTRAG_LABEL) as ThemaEintragArt[]).map(a => (
          <button
            key={a} type="button" onClick={() => setArt(a)}
            className={`text-xs px-2 py-1 rounded-full border ${art === a ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 text-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {THEMA_EINTRAG_LABEL[a]}
          </button>
        ))}
      </div>
      {bezug && (
        <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
          <Reply size={12} className="text-gray-500" />
          <span className="flex-1 min-w-0 truncate">Bezug: {THEMA_EINTRAG_LABEL[bezug.art]} von {bezug.autor.name} – {bezug.inhalt}</span>
          <button type="button" onClick={onBezugWeg} className="text-gray-400 hover:text-gray-700"><X size={12} /></button>
        </div>
      )}
      <SitzungsEditor
        content={json}
        onChange={setJson}
        placeholder="Neuer Beitrag – z. B. Vermerk aus dem Gespräch mit der Personalleitung…"
        minHeight="90px"
        personen={personen.map(p => ({ id: p.id, name: p.name }))}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-400">Beteiligte und Erwähnte werden benachrichtigt. Nicht änderbar wie ein Protokoll.</p>
        <button type="submit" disabled={senden || !text} className={haupt}>
          {senden ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Beitrag speichern
        </button>
      </div>
    </form>
  );
}

// ── Seitenleiste ────────────────────────────────────────────────

function Karte({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl">
      <h2 className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold text-gray-800">{titel}</h2>
      <div className="px-4 py-3 space-y-4">{children}</div>
    </section>
  );
}

function Verknuepfungsliste({ titel, leer, eintraege, onLoesen, onHinzu, hinzuText = "Verknüpfen", zusatz }: {
  titel: string; leer: string;
  eintraege: { id: string; text: string; unter?: string; link: string; vertraulich?: boolean; durchgestrichen?: boolean }[];
  onLoesen?: (id: string) => void; onHinzu?: () => void; hinzuText?: string; zusatz?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-gray-500">{titel}</h3>
        {onHinzu && (
          <button onClick={onHinzu} className="text-xs text-[rgb(var(--accent))] hover:underline flex items-center gap-0.5"><Plus size={11} /> {hinzuText}</button>
        )}
      </div>
      {eintraege.length === 0 ? <p className="text-xs text-gray-400">{leer}</p> : (
        <ul className="space-y-1">
          {eintraege.map(e => (
            <li key={e.id} className="flex items-start gap-1.5 group">
              <div className="flex-1 min-w-0">
                <Link to={e.link} className={`text-sm text-gray-800 hover:underline wrap-break-word ${e.durchgestrichen ? "line-through text-gray-400" : ""}`}>
                  {e.vertraulich && <Lock size={10} className="inline text-amber-600 mr-1" />}{e.text}
                </Link>
                {e.unter && <p className="text-xs text-gray-400">{e.unter}</p>}
              </div>
              {onLoesen && (
                <button onClick={() => onLoesen(e.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0" title="Verknüpfung lösen">
                  <Unlink size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {zusatz && <div className="mt-1">{zusatz}</div>}
    </div>
  );
}

// ── Dialoge ─────────────────────────────────────────────────────

function Dialog({ titel, onSchliessen, children }: { titel: string; onSchliessen: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{titel}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Knoepfe({ onSchliessen, laden, deaktiviert, text = "Speichern" }: { onSchliessen: () => void; laden?: boolean; deaktiviert?: boolean; text?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-4">
      <button type="button" onClick={onSchliessen} className={knopf}>Abbrechen</button>
      <button type="submit" disabled={laden || deaktiviert} className={haupt}>{laden && <Loader2 size={14} className="animate-spin" />}{text}</button>
    </div>
  );
}

function KopfDialog({ thema, onSchliessen, onSpeichern }: {
  thema: ThemaDetail; onSchliessen: () => void; onSpeichern: (d: Parameters<typeof api.themenakte.aendern>[1]) => Promise<void>;
}) {
  const [titel, setTitel]       = useState(thema.titel);
  const [beschreibung, setBeschreibung] = useState(thema.beschreibung ?? "");
  const [schritt, setSchritt]   = useState(thema.naechsterSchritt ?? "");
  const [termin, setTermin]     = useState(thema.naechsterTermin?.slice(0, 10) ?? "");
  const [vertraulichkeit, setVertraulichkeit] = useState<ThemaVertraulichkeit>(thema.vertraulichkeit);
  const [nurTeam, setNurTeam]   = useState(thema.nurTeam);
  const [laden, setLaden]       = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setLaden(true);
    await onSpeichern({
      titel: titel.trim(), beschreibung: beschreibung.trim() || null,
      naechsterSchritt: schritt.trim() || null, naechsterTermin: termin || null,
      ...(thema.rechte.verwalten && { vertraulichkeit, nurTeam }),
    });
    setLaden(false);
  }

  return (
    <Dialog titel="Thema bearbeiten" onSchliessen={onSchliessen}>
      <form onSubmit={absenden} className="space-y-3">
        <label className="block text-sm"><span className="text-gray-700 font-medium">Titel</span>
          <input value={titel} onChange={e => setTitel(e.target.value)} className={eingabe} required maxLength={300} />
        </label>
        <label className="block text-sm"><span className="text-gray-700 font-medium">Worum es geht</span>
          <textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} className={eingabe} rows={3} maxLength={5000} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block text-sm sm:col-span-2"><span className="text-gray-700 font-medium">Nächster Schritt</span>
            <input value={schritt} onChange={e => setSchritt(e.target.value)} className={eingabe} maxLength={500} />
          </label>
          <label className="block text-sm"><span className="text-gray-700 font-medium">bis</span>
            <input type="date" value={termin} onChange={e => setTermin(e.target.value)} className={eingabe} />
          </label>
        </div>
        {thema.rechte.verwalten ? (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <label className="block text-sm"><span className="text-gray-700 font-medium">Wer sieht das Thema?</span>
              <select value={vertraulichkeit} onChange={e => setVertraulichkeit(e.target.value as ThemaVertraulichkeit)} className={eingabe}>
                {(Object.keys(THEMA_VERTRAULICHKEIT_LABEL) as ThemaVertraulichkeit[]).map(v => <option key={v} value={v}>{THEMA_VERTRAULICHKEIT_LABEL[v]}</option>)}
              </select>
              <span className="text-xs text-gray-400">Beteiligte sehen es immer.</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={nurTeam} onChange={e => setNurTeam(e.target.checked)} />
              Nur das Projektteam schreibt (Vorsitz und Stellvertretung immer)
            </label>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Vertraulichkeit und Projektteam legen Vorsitz oder Stellvertretung fest.</p>
        )}
        <Knoepfe onSchliessen={onSchliessen} laden={laden} deaktiviert={!titel.trim()} />
      </form>
    </Dialog>
  );
}

function BeteiligteDialog({ thema, personen, onSchliessen, onSpeichern }: {
  thema: ThemaDetail; personen: Benutzer[]; onSchliessen: () => void;
  onSpeichern: (d: { beteiligte: { benutzerId: string; zustaendig: boolean }[] }) => Promise<void>;
}) {
  // undefined = nicht beteiligt, false = Projektteam, true = zuständig
  const [stand, setStand] = useState<Record<string, boolean | undefined>>(
    () => Object.fromEntries(thema.beteiligte.map(b => [b.benutzer.id, b.zustaendig])),
  );
  const [laden, setLaden] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setLaden(true);
    await onSpeichern({
      beteiligte: Object.entries(stand).filter(([, v]) => v !== undefined).map(([benutzerId, zustaendig]) => ({ benutzerId, zustaendig: !!zustaendig })),
    });
    setLaden(false);
  }

  return (
    <Dialog titel="Zuständige und Projektteam" onSchliessen={onSchliessen}>
      <form onSubmit={absenden}>
        <p className="text-xs text-gray-500 mb-3">
          Beteiligte sehen das Thema immer und bekommen eine Benachrichtigung bei neuen Beiträgen.
          {thema.nurTeam && " In diesem Thema schreiben nur sie (und Vorsitz/Stellvertretung)."}
        </p>
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {personen.map(p => {
            const v = stand[p.id];
            const setzen = (neu: boolean | undefined) => setStand(s => ({ ...s, [p.id]: neu }));
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-gray-800">{p.name}</span>
                <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
                  {([[undefined, "–"], [false, "Team"], [true, "Zuständig"]] as const).map(([wert, label]) => (
                    <button
                      key={label} type="button" onClick={() => setzen(wert)}
                      className={`px-2.5 py-1 border-l first:border-l-0 border-gray-300 ${v === wert ? "bg-[rgb(var(--accent))] text-white" : "text-gray-700 hover:bg-gray-50"}`}
                    >{label}</button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        <Knoepfe onSchliessen={onSchliessen} laden={laden} />
      </form>
    </Dialog>
  );
}

function AlsTopDialog({ thema, onSchliessen, onFertig }: { thema: ThemaDetail; onSchliessen: () => void; onFertig: () => void }) {
  const [sitzungen, setSitzungen] = useState<SitzungListItem[] | null>(null);
  const [sitzungId, setSitzungId] = useState("");
  const [titel, setTitel]         = useState(thema.titel);
  const [vertraulich, setVertraulich] = useState(thema.vertraulichkeit !== "ALLE");
  const [laden, setLaden]         = useState(false);

  useEffect(() => {
    api.sitzungen.liste()
      .then(l => setSitzungen(l.filter(s => s.status === "ENTWURF").sort((a, b) => a.sitzungsdatum.localeCompare(b.sitzungsdatum))))
      .catch(() => setSitzungen([]));
  }, []);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setLaden(true);
    try {
      await api.sitzungen.topHinzufuegen(sitzungId, { titel: titel.trim(), vertraulich, themaId: thema.id });
      onFertig();
    } catch (err) {
      alert(fehlerText(err));
    } finally {
      setLaden(false);
    }
  }

  return (
    <Dialog titel="Als TOP vormerken" onSchliessen={onSchliessen}>
      <form onSubmit={absenden} className="space-y-3">
        <p className="text-xs text-gray-500">Der TOP kommt in eine Sitzung, deren Tagesordnung noch nicht fixiert ist. Beschlossen wird dort – nicht in der Akte.</p>
        <label className="block text-sm"><span className="text-gray-700 font-medium">Sitzung</span>
          <select value={sitzungId} onChange={e => setSitzungId(e.target.value)} className={eingabe} required>
            <option value="">{sitzungen === null ? "lädt…" : sitzungen.length ? "– auswählen –" : "Keine Sitzung im Entwurf"}</option>
            {sitzungen?.map(s => <option key={s.id} value={s.id}>{s.titel} ({formatDatum(s.sitzungsdatum)})</option>)}
          </select>
        </label>
        <label className="block text-sm"><span className="text-gray-700 font-medium">Titel des TOPs</span>
          <input value={titel} onChange={e => setTitel(e.target.value)} className={eingabe} required />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={vertraulich} onChange={e => setVertraulich(e.target.checked)} /> Vertraulicher TOP
        </label>
        <Knoepfe onSchliessen={onSchliessen} laden={laden} deaktiviert={!sitzungId || !titel.trim()} text="Vormerken" />
      </form>
    </Dialog>
  );
}

function TopWaehlenDialog({ onSchliessen, onWahl }: { onSchliessen: () => void; onWahl: (topId: string) => void }) {
  const [sitzungen, setSitzungen] = useState<SitzungListItem[]>([]);
  const [sitzungId, setSitzungId] = useState("");
  const [sitzung, setSitzung]     = useState<Sitzung | null>(null);
  const [topId, setTopId]         = useState("");

  useEffect(() => { api.sitzungen.liste().then(setSitzungen).catch(() => {}); }, []);
  useEffect(() => {
    setSitzung(null); setTopId("");
    if (sitzungId) api.sitzungen.einzel(sitzungId).then(setSitzung).catch(() => {});
  }, [sitzungId]);

  return (
    <Dialog titel="Vorhandenen TOP verknüpfen" onSchliessen={onSchliessen}>
      <form onSubmit={e => { e.preventDefault(); onWahl(topId); }} className="space-y-3">
        <select value={sitzungId} onChange={e => setSitzungId(e.target.value)} className={eingabe} aria-label="Sitzung">
          <option value="">– Sitzung auswählen –</option>
          {sitzungen.map(s => <option key={s.id} value={s.id}>{s.titel} ({formatDatum(s.sitzungsdatum)})</option>)}
        </select>
        {sitzungId && (
          <select value={topId} onChange={e => setTopId(e.target.value)} className={eingabe} disabled={!sitzung} aria-label="TOP">
            <option value="">{sitzung ? "– TOP auswählen –" : "lädt…"}</option>
            {sitzung?.tops.map(t => <option key={t.id} value={t.id}>TOP {t.nummer} – {t.titel}</option>)}
          </select>
        )}
        <Knoepfe onSchliessen={onSchliessen} deaktiviert={!topId} text="Verknüpfen" />
      </form>
    </Dialog>
  );
}

function AufgabeDialog({ thema, personen, onSchliessen, onFertig }: { thema: ThemaDetail; personen: Benutzer[]; onSchliessen: () => void; onFertig: () => void }) {
  const [titel, setTitel] = useState("");
  const [zu, setZu]       = useState("");
  const [faellig, setFaellig] = useState("");
  const [laden, setLaden] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setLaden(true);
    try {
      const a = await api.aufgaben.erstellen({ titel: titel.trim(), typ: "AUFGABE", sichtbarkeit: "OEFFENTLICH", zugewiesenAnId: zu || undefined, faelligAm: faellig || undefined });
      await api.themenakte.verknuepfen(thema.id, "AUFGABE", a.id);
      onFertig();
    } catch (err) {
      alert(fehlerText(err));
    } finally {
      setLaden(false);
    }
  }

  return (
    <Dialog titel="Aufgabe zum Thema anlegen" onSchliessen={onSchliessen}>
      <form onSubmit={absenden} className="space-y-3">
        <input value={titel} onChange={e => setTitel(e.target.value)} className={eingabe} placeholder="Was ist zu tun?" required autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <select value={zu} onChange={e => setZu(e.target.value)} className={eingabe} aria-label="Zuständig">
            <option value="">– niemand –</option>
            {personen.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="date" value={faellig} onChange={e => setFaellig(e.target.value)} className={eingabe} aria-label="Fällig am" />
        </div>
        <Knoepfe onSchliessen={onSchliessen} laden={laden} deaktiviert={!titel.trim()} text="Anlegen" />
      </form>
    </Dialog>
  );
}

function BvDialog({ onSchliessen, onWahl }: { onSchliessen: () => void; onWahl: (id: string) => void }) {
  const [bvs, setBvs]   = useState<Betriebsvereinbarung[] | null>(null);
  const [wahl, setWahl] = useState("");
  useEffect(() => { api.betriebsvereinbarungen.liste().then(setBvs).catch(() => setBvs([])); }, []);
  return (
    <Dialog titel="Betriebsvereinbarung verknüpfen" onSchliessen={onSchliessen}>
      <form onSubmit={e => { e.preventDefault(); onWahl(wahl); }}>
        <select value={wahl} onChange={e => setWahl(e.target.value)} className={eingabe} aria-label="Betriebsvereinbarung">
          <option value="">{bvs === null ? "lädt…" : bvs.length ? "– auswählen –" : "Keine Betriebsvereinbarungen"}</option>
          {bvs?.map(b => <option key={b.id} value={b.id}>{b.titel} ({formatDatum(b.abschlussdatum)})</option>)}
        </select>
        <Knoepfe onSchliessen={onSchliessen} deaktiviert={!wahl} text="Verknüpfen" />
      </form>
    </Dialog>
  );
}
