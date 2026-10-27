import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Loader2, Pencil, Video } from "lucide-react";
import { api, Rolle, Sitzung, SITZUNG_FORM_LABEL, SitzungForm, TEILNAHMEART_LABEL, VideoStand } from "../lib/api";

// Sitzung per Video/Telefon (§ 30 Abs. 2 BetrVG, Roadmap Paket 6; Backend: lib/videoSitzung.ts)

// Sitzungszeit und Widerspruchsfrist liegen "wie eingegeben" in UTC (Ortszeit in den UTC-Feldern)
const fristText = (iso: string) => new Date(iso).toLocaleString("de-DE", {
  timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const zeitpunkt = (iso: string) => new Date(iso).toLocaleString("de-DE", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export default function VideoSitzungKarte({ sitzung, meineRolle, onAktualisieren }: {
  sitzung: Sitzung; meineRolle: Rolle | null; onAktualisieren: () => void;
}) {
  const [stand, setStand]       = useState<VideoStand | null>(null);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler]     = useState("");

  const vorsitz      = meineRolle === "VORSITZ" || meineRolle === "STELLVERTRETER";
  const vorDerSitzung = sitzung.status === "ENTWURF" || sitzung.status === "TAGESORDNUNG_FIXIERT";
  // Bis zur Finalisierung änderbar – im Protokoll lässt sich so nachtragen, dass zugeschaltet wurde
  const formAenderbar = vorDerSitzung || sitzung.status === "PROTOKOLL_ENTWURF";

  function laden() {
    api.sitzungen.video(sitzung.id).then(setStand).catch(() => setStand(null));
  }
  useEffect(laden, [sitzung.id, sitzung.form, sitzung.aktualisiertAm]);

  async function aktion(fn: () => Promise<unknown>) {
    setFehler(""); setArbeitet(true);
    try {
      await fn();
      laden();
      onAktualisieren();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setArbeitet(false);
    }
  }

  if (!stand) return null;
  const praesenz = stand.form === "PRAESENZ";
  // Präsenzsitzung ohne Möglichkeit, das zu ändern: nichts anzeigen
  if (praesenz && !(vorsitz && formAenderbar && stand.regeln.erlaubt)) return null;

  const w = stand.widerspruch;
  const vertraulicheTops = sitzung.tops.filter(t => t.vertraulich);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 mb-5 text-sm space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Video size={15} className="text-[rgb(var(--accent))]" />
        <span className="font-semibold text-gray-800">{SITZUNG_FORM_LABEL[stand.form]}</span>
        {!praesenz && <span className="text-xs text-gray-500">§ 30 Abs. 2 BetrVG</span>}
        {vorsitz && formAenderbar && !bearbeiten && (
          <button onClick={() => setBearbeiten(true)}
            className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-[rgb(var(--accent))]">
            <Pencil size={12} /> {praesenz ? "Video/Telefon ermöglichen" : "Ändern"}
          </button>
        )}
      </div>

      {bearbeiten && (
        <FormBearbeiten sitzung={sitzung} stand={stand}
          onAbbrechen={() => setBearbeiten(false)}
          onGespeichert={() => { setBearbeiten(false); laden(); onAktualisieren(); }} />
      )}

      {!praesenz && !bearbeiten && (
        <>
          {w.gesperrt ? (
            <p className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Mindestens ein Viertel der Mitglieder hat widersprochen ({w.anzahl} von {w.sollStaerke}) – die Sitzung findet nur vor Ort statt.
            </p>
          ) : (
            <div className="text-xs text-gray-600 space-y-0.5">
              {stand.einwahlLink && (
                <p>Einwahl: <a href={stand.einwahlLink} target="_blank" rel="noreferrer" className="text-[rgb(var(--accent))] hover:underline break-all">{stand.einwahlLink}</a></p>
              )}
              {/* Widerspruch und Vorrang betreffen nur die Zeit vor der Sitzung */}
              {vorDerSitzung && (
                <p>
                  Widersprüche: {w.anzahl} – ab {w.schwelle} von {w.sollStaerke} Mitgliedern ist die Zuschaltung gesperrt
                  {stand.widerspruchBis && <> · Frist bis {fristText(stand.widerspruchBis)} Uhr</>}
                </p>
              )}
              {vorDerSitzung && stand.form === "ZUSCHALTUNG" && <p className="text-gray-500">Vorrang hat die Teilnahme vor Ort.</p>}
            </div>
          )}

          {vorsitz && w.namen.length > 0 && (
            <p className="text-xs text-gray-500">Widersprochen haben: {w.namen.map(n => `${n.name} (${zeitpunkt(n.am)})`).join(", ")}</p>
          )}

          {stand.regeln.nichtVertraulich && vertraulicheTops.length > 0 && !w.gesperrt && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Laut Geschäftsordnung keine Zuschaltung bei vertraulichen TOPs: {vertraulicheTops.map(t => `TOP ${t.nummer}`).join(", ")} –
              Zugeschaltete nehmen daran nicht teil.
            </p>
          )}
          {sitzung.sitzungstyp === "KONSTITUIEREND" && (
            <p className="text-xs text-amber-800">Ob die konstituierende Sitzung per Video/Telefon stattfinden darf, ist rechtlich nicht geklärt – im Zweifel in Präsenz.</p>
          )}

          {w.darf && w.offen && (
            w.eigenerAm ? (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-gray-600">Du hast am {zeitpunkt(w.eigenerAm)} widersprochen.</span>
                <button onClick={() => aktion(() => api.sitzungen.widerspruchZuruecknehmen(sitzung.id))} disabled={arbeitet}
                  className="text-gray-500 hover:text-gray-800 underline">Zurücknehmen</button>
              </div>
            ) : !w.gesperrt && (
              <button onClick={() => { if (confirm("Der Teilnahme per Video/Telefon an dieser Sitzung widersprechen? Der Vorsitz wird benachrichtigt.")) aktion(() => api.sitzungen.widersprechen(sitzung.id)); }}
                disabled={arbeitet}
                className="text-xs border border-gray-300 hover:border-red-300 hover:text-red-700 rounded-lg px-3 py-1">
                Der Zuschaltung widersprechen
              </button>
            )
          )}
        </>
      )}

      {/* § 34 Abs. 1 S. 4: eigene Teilnahme per Video/Telefon bestätigen */}
      {stand.meineTeilnahme && (
        stand.meineTeilnahme.bestaetigtAm ? (
          <p className="flex items-center gap-1.5 text-xs text-green-700">
            <CheckCircle size={13} /> Deine Teilnahme {TEILNAHMEART_LABEL[stand.meineTeilnahme.teilnahmeart]} ist bestätigt ({zeitpunkt(stand.meineTeilnahme.bestaetigtAm)}).
          </p>
        ) : (sitzung.status === "PROTOKOLL_ENTWURF" || sitzung.status === "TAGESORDNUNG_FIXIERT") && (
          <div className="flex items-center gap-2 flex-wrap bg-accent/5 border border-accent/20 rounded-lg px-3 py-2 text-xs">
            <span className="text-gray-700 flex-1 min-w-[200px]">
              Du bist {TEILNAHME_LABEL_SATZ[stand.meineTeilnahme.teilnahmeart]} eingetragen. Bitte bestätige deine Teilnahme (§ 34 Abs. 1 BetrVG) –
              die Bestätigung kommt als Anlage ins Protokoll.
            </span>
            <button onClick={() => aktion(() => api.sitzungen.teilnahmeBestaetigen(sitzung.id))} disabled={arbeitet}
              className="bg-[rgb(var(--accent))] hover:brightness-90 text-white rounded-lg px-3 py-1 font-medium">
              Ich habe an der Sitzung teilgenommen
            </button>
          </div>
        )
      )}

      {vorsitz && stand.bestaetigungen.length > 0 && (sitzung.status === "PROTOKOLL_ENTWURF" || sitzung.status === "PROTOKOLL_FINAL" || sitzung.status === "ABGESCHLOSSEN") && (
        <div className="text-xs text-gray-600">
          <span className="font-medium">Bestätigungen (§ 34 Abs. 1): </span>
          {stand.bestaetigungen.map(b => (
            <span key={b.name} className={`mr-3 ${b.bestaetigtAm ? "text-green-700" : "text-red-700"}`}>
              {b.name} ({TEILNAHMEART_LABEL[b.teilnahmeart]}) {b.bestaetigtAm ? `✓ ${zeitpunkt(b.bestaetigtAm)}` : "– offen"}
            </span>
          ))}
        </div>
      )}

      {arbeitet && <Loader2 size={13} className="animate-spin text-gray-400" />}
      {fehler && <p className="text-xs text-red-700">{fehler}</p>}
    </div>
  );
}

const TEILNAHME_LABEL_SATZ: Record<string, string> = { VIDEO: "als per Video zugeschaltet", TELEFON: "als per Telefon zugeschaltet", VOR_ORT: "vor Ort" };

function FormBearbeiten({ sitzung, stand, onAbbrechen, onGespeichert }: {
  sitzung: Sitzung; stand: VideoStand; onAbbrechen: () => void; onGespeichert: () => void;
}) {
  const [form, setForm]   = useState<SitzungForm>(stand.form);
  const [link, setLink]   = useState(stand.einwahlLink ?? "");
  const [frist, setFrist] = useState(stand.widerspruchBis?.slice(0, 16) ?? "");
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState("");

  async function speichern() {
    setFehler(""); setLaden(true);
    try {
      await api.sitzungen.aktualisieren(sitzung.id, {
        form,
        einwahlLink: form === "PRAESENZ" ? null : link.trim() || null,
        // Ortszeit wie eingegeben in den UTC-Feldern ablegen (wie die Sitzungszeit)
        widerspruchBis: form === "PRAESENZ" || !frist ? null : `${frist}:00Z`,
      });
      onGespeichert();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  const feld = "w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]";

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3">
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(SITZUNG_FORM_LABEL) as SitzungForm[]).map(f => (
          <label key={f} className={`flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 cursor-pointer ${form === f ? "border-[rgb(var(--accent))] bg-accent/5" : "border-gray-200"}`}>
            <input type="radio" name="form" checked={form === f} onChange={() => setForm(f)} />
            {SITZUNG_FORM_LABEL[f]}
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Die Präsenzsitzung hat Vorrang (§ 30 Abs. 2 Nr. 1 BetrVG). Widerspricht mindestens ein Viertel der Mitglieder
        innerhalb der Frist, findet die Sitzung nur vor Ort statt.
        {stand.regeln.bedingungen && <> Bedingungen laut Geschäftsordnung: <span className="text-gray-700">{stand.regeln.bedingungen}</span></>}
      </p>
      {form !== "PRAESENZ" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Einwahllink</label>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" className={feld} />
          </div>
          {/* Nach der Sitzung gibt es nichts mehr zu widersprechen – nur noch Form und Link nachtragen */}
          {sitzung.status !== "PROTOKOLL_ENTWURF" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Widerspruch möglich bis</label>
              <input type="datetime-local" value={frist} onChange={e => setFrist(e.target.value)} className={feld} />
            </div>
          )}
        </div>
      )}
      {form !== "PRAESENZ" && (
        <p className="text-xs text-gray-500">Link und Frist stehen in der Einladungsmail. Die Sitzung darf nicht aufgezeichnet werden.</p>
      )}
      {fehler && <p className="text-xs text-red-700">{fehler}</p>}
      <div className="flex gap-2">
        <button onClick={speichern} disabled={laden}
          className="flex items-center gap-1 text-xs bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg font-medium">
          {laden && <Loader2 size={11} className="animate-spin" />} Speichern
        </button>
        <button onClick={onAbbrechen} className="text-xs text-gray-500 hover:text-gray-700 px-2">Abbrechen</button>
      </div>
    </div>
  );
}
