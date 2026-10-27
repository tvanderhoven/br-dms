import VertraulichkeitAuswahl, { felderVon, type Vertraulichkeit } from "./VertraulichkeitAuswahl";
import { useState, useRef, FormEvent } from "react";
import { X, Loader2, Search, Upload, Mail } from "lucide-react";
import { api, Dokument, Kategorie, KATEGORIE_LABEL, Ordner, istEmailDatei } from "../lib/api";
import { ordnerOptionen } from "./OrdnerBaum";

// ── Upload-Modal ──────────────────────────────────────────────────
export default function UploadModal({ ordner, startOrdnerId, onSchliessen, onErfolg }: {
  ordner: Ordner[];
  startOrdnerId: string | null;
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [laden, setLaden]                 = useState(false);
  const [fehler, setFehler]               = useState("");
  const [datei, setDatei]                 = useState<File | null>(null);
  const [titel, setTitel]                 = useState("");
  const [kategorie, setKategorie]         = useState<Kategorie>("SONSTIGES");
  const [kuendigungsArt, setKuendigungsArt] = useState<"ORDENTLICH" | "AUSSERORDENTLICH">("ORDENTLICH");
  const [aktenzeichen, setAktenzeichen]   = useState("");
  const [vertraulichkeit, setVertraulichkeit] = useState<Vertraulichkeit>("OFFEN");
  const [ordnerId, setOrdnerId]           = useState(startOrdnerId ?? "");
  const [anhaengeAblegen, setAnhaengeAblegen] = useState(true);
  const [ziehen, setZiehen]               = useState(false);
  const [istVersion, setIstVersion]       = useState(false);
  const [versionSuche, setVersionSuche]   = useState("");
  const [versionTreffer, setVersionTreffer] = useState<Dokument[]>([]);
  const [versionVonId, setVersionVonId]   = useState<string | null>(null);
  const [versionVonTitel, setVersionVonTitel] = useState("");
  const [aenderungsnotiz, setAenderungsnotiz] = useState("");
  const [sucheLaden, setSucheLaden]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sucheTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSucheChange(q: string) {
    setVersionSuche(q);
    setVersionVonId(null);
    setVersionVonTitel("");
    if (sucheTimer.current) clearTimeout(sucheTimer.current);
    if (q.trim().length < 2) { setVersionTreffer([]); return; }
    sucheTimer.current = setTimeout(async () => {
      setSucheLaden(true);
      try {
        const treffer = await api.dokumente.suche(q.trim());
        setVersionTreffer(treffer);
      } catch { setVersionTreffer([]); }
      finally { setSucheLaden(false); }
    }, 300);
  }

  function waehleVersionVon(d: Dokument) {
    setVersionVonId(d.id);
    setVersionVonTitel(d.alias ?? d.titel);
    setVersionTreffer([]);
    setVersionSuche("");
  }

  const istMail = !!datei && istEmailDatei(datei.name);

  function dateiWaehlen(f: File | null) {
    setDatei(f);
    // Bei E-Mails bleibt der Titel leer – dann übernimmt das System den Betreff
    if (f && !titel && !istEmailDatei(f.name)) setTitel(f.name.replace(/\.[^.]+$/, ""));
  }

  async function hochladen(e: FormEvent) {
    e.preventDefault();
    if (!datei) return;
    if (istVersion && !versionVonId) {
      setFehler("Bitte ein Dokument auswählen, zu dem diese Version gehört.");
      return;
    }
    setFehler("");
    setLaden(true);
    try {
      // Metadaten zuerst, die Datei zuletzt – so stehen die Felder auch für Server bereit, die den Upload streamen
      const form = new FormData();
      if (istVersion && versionVonId) {
        if (aenderungsnotiz) form.append("aenderungsnotiz", aenderungsnotiz);
        form.append("file", datei);
        await api.dokumente.versionHochladen(versionVonId, form);
      } else {
        form.append("titel", titel);
        form.append("kategorie", kategorie);
        if (kategorie === "ANHOERUNG_102") form.append("kuendigungsArt", kuendigungsArt);
        if (aktenzeichen) form.append("aktenzeichen", aktenzeichen);
        const stufe = felderVon(vertraulichkeit);
        form.append("vertraulich", String(stufe.vertraulich));
        form.append("vertraulichFuerMitglieder", String(stufe.vertraulichFuerMitglieder));
        if (ordnerId) form.append("ordnerId", ordnerId);
        if (istMail) form.append("anhaengeAblegen", String(anhaengeAblegen));
        form.append("file", datei);
        await api.dokumente.upload(form);
      }
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Dokument hochladen</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={hochladen} className="px-6 py-4 space-y-4">
          {/* Datei */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Datei</label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setZiehen(true); }}
              onDragLeave={() => setZiehen(false)}
              onDrop={e => { e.preventDefault(); setZiehen(false); const f = e.dataTransfer.files?.[0]; if (f) dateiWaehlen(f); }}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                ziehen ? "border-[rgb(var(--accent))] bg-accent/5" : "border-gray-300 hover:border-accent/60"
              }`}
            >
              {datei ? (
                <p className="text-sm text-gray-700 font-medium flex items-center justify-center gap-1.5">
                  {istMail && <Mail size={14} className="text-[rgb(var(--accent))]" />}{datei.name}
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-400">Klicken oder Datei hierher ziehen</p>
                  <p className="text-xs text-gray-400 mt-0.5">PDF, Word, Excel oder E-Mail (.eml, .msg)</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.docm,.xlsx,.eml,.msg"
                className="hidden"
                onChange={e => dateiWaehlen(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {/* Version-Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={istVersion}
              onChange={e => { setIstVersion(e.target.checked); setVersionVonId(null); setVersionVonTitel(""); setVersionSuche(""); setVersionTreffer([]); }}
              className="rounded-sm border-gray-300 text-[rgb(var(--accent))]"
            />
            <span className="text-sm text-gray-700">Als neue Version eines vorhandenen Dokuments</span>
          </label>

          {/* Versions-Suche */}
          {istVersion && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dokument auswählen *
              </label>
              {versionVonId ? (
                <div className="flex items-center justify-between bg-accent/5 border border-accent/25 rounded-lg px-3 py-2 text-sm">
                  <span className="text-accent font-medium truncate">{versionVonTitel}</span>
                  <button type="button" onClick={() => { setVersionVonId(null); setVersionVonTitel(""); }} className="text-accent/60 hover:text-accent ml-2 shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={versionSuche}
                      onChange={e => onSucheChange(e.target.value)}
                      placeholder="Titel suchen…"
                      className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                    {sucheLaden && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
                  </div>
                  {versionTreffer.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {versionTreffer.map(d => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => waehleVersionVon(d)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        >
                          <p className="font-medium text-gray-800 truncate">{d.alias ?? d.titel}</p>
                          <p className="text-xs text-gray-400">{KATEGORIE_LABEL[d.kategorie]}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Änderungsnotiz (nur bei Version) */}
          {istVersion && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Änderungsnotiz</label>
              <input
                value={aenderungsnotiz}
                onChange={e => setAenderungsnotiz(e.target.value)}
                placeholder="Was wurde geändert? (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
          )}

          {/* Felder für neues Dokument */}
          {!istVersion && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titel{istMail ? "" : " *"}</label>
                <input
                  value={titel}
                  onChange={e => setTitel(e.target.value)}
                  required={!istMail}
                  placeholder={istMail ? "Leer lassen = Betreff der E-Mail" : undefined}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategorie *</label>
                <select
                  value={kategorie}
                  onChange={e => setKategorie(e.target.value as Kategorie)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white"
                >
                  {ALLE_KATEGORIEN.map(k => (
                    <option key={k} value={k}>{KATEGORIE_LABEL[k]}</option>
                  ))}
                </select>
              </div>

              {kategorie === "ANHOERUNG_102" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Art der Kündigung *</label>
                  <select
                    value={kuendigungsArt}
                    onChange={e => setKuendigungsArt(e.target.value as "ORDENTLICH" | "AUSSERORDENTLICH")}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white"
                  >
                    <option value="ORDENTLICH">Ordentliche Kündigung (Anhörungsfrist 7 Tage)</option>
                    <option value="AUSSERORDENTLICH">Außerordentliche Kündigung (Anhörungsfrist 3 Tage)</option>
                  </select>
                </div>
              )}

              <OrdnerFeld ordner={ordner} wert={ordnerId} onChange={setOrdnerId} />

              {istMail && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={anhaengeAblegen}
                    onChange={e => setAnhaengeAblegen(e.target.checked)}
                    className="rounded-sm border-gray-300 text-[rgb(var(--accent))] mt-0.5"
                  />
                  <span className="text-sm text-gray-700">
                    PDF-, Word- und Excel-Anhänge zusätzlich als eigene Dokumente ablegen
                    <span className="block text-xs text-gray-400">mit Kategorie, Ordner und Vertraulichkeit der E-Mail</span>
                  </span>
                </label>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aktenzeichen</label>
                <input
                  value={aktenzeichen}
                  onChange={e => setAktenzeichen(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  placeholder="Optional"
                />
              </div>

              <VertraulichkeitAuswahl wert={vertraulichkeit} onChange={setVertraulichkeit} />
            </>
          )}

          {fehler && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {fehler}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={laden || !datei}
              className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2"
            >
              {laden && <Loader2 size={14} className="animate-spin" />}
              {istVersion ? "Als Version hochladen" : "Hochladen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const ALLE_KATEGORIEN = Object.keys(KATEGORIE_LABEL) as Kategorie[];

// Ordnerauswahl in Hochladen/Bearbeiten – zeigt den ganzen Pfad
export function OrdnerFeld({ ordner, wert, onChange }: { ordner: Ordner[]; wert: string; onChange: (id: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Ordner</label>
      <select
        value={wert}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white"
      >
        <option value="">– ohne Ordner –</option>
        {ordnerOptionen(ordner).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

