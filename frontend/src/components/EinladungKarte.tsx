/**
 * Einladung per E-Mail mit Versandnachweis (Paket 4, Stufe 3) und Abrufnachweis;
 * Detailstufe je Versand („Einladungsmail datensparsam“)
 * Backend: routes/einladung.ts, lib/einladungDetail.ts
 */
import { useEffect, useState } from "react";
import { Mail, Send, Loader2, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, X, Eye } from "lucide-react";
import { api, Rolle, EinladungStand, EinladungDetail, EINLADUNG_DETAIL_LABEL, EINLADUNG_DETAIL_HINWEIS, Verfuegbarkeit } from "../lib/api";

const ROLLE_LABEL: Record<string, string> = {
  VORSITZ: "Vorsitz", STELLVERTRETER: "Stellv. Vorsitz", MITGLIED: "Mitglied",
  ERSATZMITGLIED: "Ersatzmitglied", JAV: "JAV", SBV: "SBV",
};

function zeitpunkt(iso: string) {
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function EinladungKarte({ sitzungId, meineRolle, aktualisierung }: {
  sitzungId: string;
  meineRolle: Rolle | null;
  aktualisierung: number;   // ändert sich, wenn die Ladung (Anwesenheit) geändert wurde
}) {
  const [stand, setStand]       = useState<EinladungStand | null>(null);
  const [sendet, setSendet]     = useState<string | null>(null);   // "alle" oder benutzerId
  const [meldung, setMeldung]   = useState("");
  const [fehler, setFehler]     = useState("");
  const [protokollOffen, setProtokollOffen] = useState(false);
  // Versand-Fenster: an wen (undefined = alle noch nicht Eingeladenen) und Zusatztext
  const [dialog, setDialog]     = useState<{ benutzerIds?: string[]; namen: string[] } | null>(null);
  const [zusatz, setZusatz]     = useState("");
  const [detail, setDetail]     = useState<EinladungDetail>("VOLLSTAENDIG");

  const darfSenden = !!meineRolle && ["VORSITZ", "STELLVERTRETER", "ADMIN"].includes(meineRolle);

  const [kalender, setKalender] = useState<Verfuegbarkeit | null>(null);

  function laden() {
    api.sitzungen.einladung(sitzungId).then(setStand).catch(e => setFehler(e instanceof Error ? e.message : "Fehler"));
    api.sitzungen.verfuegbarkeit(sitzungId).then(setKalender).catch(() => setKalender(null));
  }
  useEffect(laden, [sitzungId, aktualisierung]);

  function dialogOeffnen(benutzerIds: string[] | undefined, namen: string[]) {
    setZusatz(stand?.letzterZusatz ?? "");
    setDetail(stand?.detailStandard ?? "VOLLSTAENDIG");
    setDialog({ benutzerIds, namen });
  }

  async function senden(benutzerIds: string[] | undefined) {
    setDialog(null);
    setFehler(""); setMeldung("");
    setSendet(benutzerIds ? benutzerIds[0] : "alle");
    try {
      const r = await api.sitzungen.einladungVersenden(sitzungId, benutzerIds, zusatz, detail);
      setMeldung(r.fehlgeschlagen > 0
        ? `${r.gesendet} verschickt, ${r.fehlgeschlagen} fehlgeschlagen`
        : `${r.gesendet} Einladung${r.gesendet === 1 ? "" : "en"} verschickt`);
      laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Versand fehlgeschlagen");
    } finally {
      setSendet(null);
    }
  }

  if (!stand) return null;
  const offen = stand.empfaenger.filter(e => !e.letzterVersand?.erfolgreich);
  const eingeladen = stand.empfaenger.length - offen.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
            <Mail size={15} className="text-gray-400" /> Einladung per E-Mail
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {eingeladen} von {stand.empfaenger.length} Geladenen eingeladen
            {stand.empfaenger.some(e => e.letzterVersand?.abgerufenAm) && <> · {stand.empfaenger.filter(e => e.letzterVersand?.abgerufenAm).length} abgerufen</>}
            {" "}· Standard: {EINLADUNG_DETAIL_LABEL[stand.detailStandard]} (JAV/SBV ohne vertrauliche TOPs und PDF)
          </p>
        </div>
        {darfSenden && stand.kannVersenden && stand.smtpAktiv && offen.length > 0 && (
          <button
            onClick={() => dialogOeffnen(undefined, offen.map(e => e.name))}
            disabled={!!sendet}
            className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            {sendet === "alle" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {eingeladen === 0 ? "Einladung senden" : "An Neue senden"} ({offen.length})
          </button>
        )}
      </div>

      {!stand.smtpAktiv && (
        <p className="mx-4 mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Es ist kein Mailserver eingerichtet (SMTP_HOST in der .env) – Einladungen können nicht verschickt werden.
        </p>
      )}
      {!stand.kannVersenden && eingeladen === 0 && (
        <p className="mx-4 mt-3 text-xs text-gray-500">Einladungen gehen raus, sobald die Tagesordnung fixiert ist.</p>
      )}
      {kalender && (kalender.offeneAenderungen > 0 || kalender.konflikte.length > 0) && (
        <p className="mx-4 mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Laut Abwesenheitskalender stimmt die Ladung noch nicht:
          {kalender.konflikte.length > 0 && <> {kalender.konflikte.map(k => k.name).join(", ")} {kalender.konflikte.length === 1 ? "ist" : "sind"} geladen, aber abwesend.</>}
          {kalender.offeneAenderungen > 0 && <> {kalender.offeneAenderungen} Änderung{kalender.offeneAenderungen === 1 ? "" : "en"} offen (Verhinderung, „Kommt“, Ersatz).</>}
          {" "}<a href="#ladung" className="font-medium underline">Unter „Ladung &amp; Verhinderung“ übernehmen</a>
        </p>
      )}
      {kalender && !kalender.prognose.beschlussfaehig && (
        <p className="mx-4 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Voraussichtlich nicht beschlussfähig: {kalender.prognose.mitErsatz} von {kalender.prognose.sollStaerke} Sitzen besetzt, nötig sind {kalender.prognose.mindestens} (§ 33 Abs. 2 BetrVG).
        </p>
      )}
      {meldung && <p className="mx-4 mt-3 text-xs text-green-700">{meldung}</p>}
      {fehler && <p className="mx-4 mt-3 text-xs text-red-700">{fehler}</p>}

      <div className="divide-y divide-gray-50 mt-2">
        {stand.empfaenger.map(e => {
          const l = e.letzterVersand;
          return (
            <div key={e.benutzerId} className="px-4 py-2 flex items-center gap-3 text-sm">
              <div className="shrink-0">
                {!l ? <Clock size={15} className="text-gray-300" />
                  : l.erfolgreich ? <CheckCircle size={15} className="text-green-600" />
                  : <XCircle size={15} className="text-red-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 truncate">
                  {e.name}
                  <span className="text-xs text-gray-400 ml-2">{ROLLE_LABEL[e.rolle] ?? e.rolle}</span>
                  {e.ersatzFuer && <span className="text-xs font-medium text-[rgb(var(--accent))] ml-1">für {e.ersatzFuer}</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">{e.adresse}</p>
              </div>
              <div className="text-xs text-right shrink-0">
                {!l ? <span className="text-gray-400">noch nicht eingeladen</span>
                  : l.erfolgreich ? <span className="text-green-700">eingeladen {zeitpunkt(l.versendetAm)}</span>
                  : <span className="text-red-700" title={l.fehler ?? ""}>fehlgeschlagen {zeitpunkt(l.versendetAm)}</span>}
                {l?.erfolgreich && (l.abgerufenAm
                  ? <p className="text-gray-500 flex items-center justify-end gap-1" title="Sitzung nach der Einladung in BR-DMS geöffnet"><Eye size={11} /> abgerufen {zeitpunkt(l.abgerufenAm)}</p>
                  : <p className="text-gray-400">noch nicht abgerufen</p>)}
                {l && l.adresse !== e.adresse && <p className="text-gray-400">an {l.adresse}</p>}
              </div>
              {darfSenden && stand.kannVersenden && stand.smtpAktiv && l && (
                <button
                  onClick={() => dialogOeffnen([e.benutzerId], [e.name])}
                  disabled={!!sendet}
                  title="Einladung erneut senden"
                  className="text-xs text-gray-500 hover:text-[rgb(var(--accent))] disabled:opacity-40 shrink-0"
                >
                  {sendet === e.benutzerId ? <Loader2 size={13} className="animate-spin" /> : "erneut"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {stand.protokoll.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setProtokollOffen(o => !o)}
            className="w-full px-4 py-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {protokollOffen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Versandprotokoll ({stand.protokoll.length})
          </button>
          {protokollOffen && (
            <table className="w-full text-xs mb-2">
              <tbody className="divide-y divide-gray-50">
                {stand.protokoll.map(p => (
                  <tr key={p.id}>
                    <td className="px-4 py-1 text-gray-500 whitespace-nowrap">{zeitpunkt(p.versendetAm)}</td>
                    <td className="px-2 py-1 text-gray-800">{p.name}{p.vertretungFuer ? ` (für ${p.vertretungFuer})` : ""}</td>
                    <td className="px-2 py-1 text-gray-500">{p.adresse}{p.zusatz && <span className="block text-gray-400 truncate max-w-xs" title={p.zusatz}>Zusatz: {p.zusatz}</span>}</td>
                    <td className="px-2 py-1">{p.erfolgreich
                      ? <span className="text-green-700">zugestellt an Mailserver · {EINLADUNG_DETAIL_LABEL[p.detail]}{p.mitAnhang ? " mit PDF" : ""}
                          <span className="block text-gray-400">{p.abgerufenAm ? `abgerufen ${zeitpunkt(p.abgerufenAm)}` : "noch nicht abgerufen"}</span></span>
                      : <span className="text-red-700">{p.fehler}</span>}</td>
                    <td className="px-4 py-1 text-gray-400 text-right whitespace-nowrap">von {p.versendetVon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Einladung senden</h2>
              <button onClick={() => setDialog(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-gray-600">
                An {dialog.namen.length === 1 ? dialog.namen[0] : `${dialog.namen.length} Geladene`} – die Signatur aus
                Einstellungen → System kommt automatisch darunter.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Inhalt der Mail</label>
                <div className="space-y-1">
                  {(Object.keys(EINLADUNG_DETAIL_LABEL) as EinladungDetail[]).map(d => (
                    <label key={d} className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="radio" name="einladung-detail" checked={detail === d} onChange={() => setDetail(d)} className="mt-0.5" />
                      <span><span className="font-medium text-gray-800">{EINLADUNG_DETAIL_LABEL[d]}</span>
                        <span className="text-gray-500"> – {EINLADUNG_DETAIL_HINWEIS[d]}</span>
                        {d === stand.detailStandard && <span className="text-xs text-gray-400"> (Standard)</span>}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Für TOPs mit neutralem Titel steht in Mail und Kalendertermin nur dieser. Der Kalendertermin folgt derselben Stufe.
                </p>
                {detail === "NUR_LINK" && (
                  <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    BR-DMS ist nur im Intranet erreichbar. § 29 Abs. 2 BetrVG verlangt, dass die Tagesordnung mitgeteilt wird –
                    wer verhindert zu Hause ist, kommt mit „Nur Link“ eventuell nicht an sie heran. Ob jemand die Sitzung
                    geöffnet hat, zeigt der Abrufnachweis.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zusätzlicher Text (optional)</label>
                <textarea
                  value={zusatz}
                  onChange={e => setZusatz(e.target.value)}
                  rows={5}
                  autoFocus
                  placeholder={"z. B. Einwahl per GoTo Meeting: https://meet.goto.com/123456789\noder ein Hinweis zur Sitzung"}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y"
                />
                <p className="text-xs text-gray-400 mt-1">Erscheint hervorgehoben unter Termin und Ort; Links werden anklickbar. Wird im Versandnachweis mitgespeichert.</p>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button onClick={() => setDialog(null)} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Abbrechen
              </button>
              <button
                onClick={() => senden(dialog.benutzerIds)}
                className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 text-white rounded-lg flex items-center justify-center gap-2"
              >
                <Send size={14} /> Senden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
