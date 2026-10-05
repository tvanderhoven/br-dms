/**
 * Einladung per E-Mail mit Versandnachweis (Paket 4, Stufe 3)
 * Backend: routes/einladung.ts
 */
import { useEffect, useState } from "react";
import { Mail, Send, Loader2, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { api, Rolle, EinladungStand } from "../lib/api";

const ROLLE_LABEL: Record<string, string> = {
  VORSITZ: "Vorsitz", STELLVERTRETER: "Stellv. Vorsitz", MITGLIED: "Mitglied",
  ERSATZMITGLIED: "Ersatzmitglied", JAV: "JAV",
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

  const darfSenden = !!meineRolle && ["VORSITZ", "STELLVERTRETER", "ADMIN"].includes(meineRolle);

  function laden() {
    api.sitzungen.einladung(sitzungId).then(setStand).catch(e => setFehler(e instanceof Error ? e.message : "Fehler"));
  }
  useEffect(laden, [sitzungId, aktualisierung]);

  async function senden(benutzerIds?: string[]) {
    setFehler(""); setMeldung("");
    setSendet(benutzerIds ? benutzerIds[0] : "alle");
    try {
      const r = await api.sitzungen.einladungVersenden(sitzungId, benutzerIds);
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
            {eingeladen} von {stand.empfaenger.length} Geladenen eingeladen · mit Tagesordnung als PDF (JAV ohne vertrauliche TOPs)
          </p>
        </div>
        {darfSenden && stand.kannVersenden && stand.smtpAktiv && offen.length > 0 && (
          <button
            onClick={() => senden()}
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
                {l && l.adresse !== e.adresse && <p className="text-gray-400">an {l.adresse}</p>}
              </div>
              {darfSenden && stand.kannVersenden && stand.smtpAktiv && l && (
                <button
                  onClick={() => senden([e.benutzerId])}
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
                    <td className="px-2 py-1 text-gray-500">{p.adresse}</td>
                    <td className="px-2 py-1">{p.erfolgreich
                      ? <span className="text-green-700">zugestellt an Mailserver{p.mitAnhang ? " · mit PDF" : ""}</span>
                      : <span className="text-red-700">{p.fehler}</span>}</td>
                    <td className="px-4 py-1 text-gray-400 text-right whitespace-nowrap">von {p.versendetVon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
