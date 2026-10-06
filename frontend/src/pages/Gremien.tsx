import { useState, useEffect, FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Landmark, Plus, Trash2, Edit3, X, Loader2, ChevronLeft, Upload, Lock, FileText,
  CalendarDays, Download, UserPlus, Users,
} from "lucide-react";
import {
  api, Gremium, Fremdprotokoll, SitzungListItem, GremiumMitglied, Benutzer, formatDatum, SITZUNGSTYP_LABEL, sitzungStatusLabel,
} from "../lib/api";
import { ROLLEN_LABEL, ROLLEN_FARBE } from "./Benutzer";

// Datei herunterladen statt in einem Tab zu öffnen – Fremdprotokolle sind oft Scans
// (PDF/JPG/PNG) oder DOCX, der Blob-Download funktioniert für alle Dateitypen gleich.
function fremdprotokollHerunterladen(id: string, dateiname: string) {
  const token = localStorage.getItem("brdms_token");
  fetch(api.fremdprotokolle.downloadUrl(id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = dateiname;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    })
    .catch(err => alert(err instanceof Error ? err.message : "Datei konnte nicht heruntergeladen werden"));
}

export default function Gremien() {
  const [liste, setListe]   = useState<Gremium[]>([]);
  const [laden, setLaden]   = useState(true);
  const [modal, setModal]   = useState(false);
  const [bearbeitet, setBearbeitet] = useState<Gremium | null>(null);
  const [ausgewaehlt, setAusgewaehlt] = useState<Gremium | null>(null);

  function liste_laden() {
    setLaden(true);
    api.gremien.liste().then(setListe).catch(console.error).finally(() => setLaden(false));
  }

  useEffect(liste_laden, []);

  async function loeschen(g: Gremium) {
    if (!confirm(`Gremium "${g.name}" wirklich löschen?`)) return;
    try {
      await api.gremien.loeschen(g.id);
      liste_laden();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Löschen");
    }
  }

  if (ausgewaehlt) {
    return (
      <GremiumDetail
        gremium={ausgewaehlt}
        onZurueck={() => { setAusgewaehlt(null); liste_laden(); }}
        onGeaendert={(g) => setAusgewaehlt(g)}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <Landmark className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gremien</h1>
            <p className="text-sm text-gray-500">Andere Gremien (Ausschüsse, JAV, SBV, …) mit Fremdprotokollen und optional eigenen Sitzungen</p>
          </div>
        </div>
        <button
          onClick={() => { setBearbeitet(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:brightness-90 transition-colors"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          <Plus size={16} /> Neues Gremium
        </button>
      </div>

      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : liste.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Landmark size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Noch keine Gremien erfasst</p>
          <p className="text-sm mt-1">Klicke auf „Neues Gremium" um z.B. den ASA oder den Wirtschaftsausschuss anzulegen.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {liste.map(g => (
            <div
              key={g.id}
              onClick={() => setAusgewaehlt(g)}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-accent/30 transition-all cursor-pointer relative group"
            >
              {!g.aktiv && (
                <span className="absolute top-3 right-3 text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 bg-gray-100 text-gray-500">
                  Inaktiv
                </span>
              )}
              <h3 className="font-semibold text-gray-900 pr-16">{g.name}</h3>
              {g.rechtsgrundlage && <p className="text-xs text-gray-400 mt-0.5">{g.rechtsgrundlage}</p>}
              {g.bemerkung && <p className="text-sm text-gray-500 mt-2 line-clamp-2">{g.bemerkung}</p>}
              <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                <span>{g._count?.sitzungen ?? 0} Sitzung(en)</span>
                <span>{g._count?.fremdprotokolle ?? 0} Fremdprotokoll(e)</span>
              </div>
              <div className="absolute bottom-3 right-3 hidden group-hover:flex gap-1">
                <button
                  onClick={e => { e.stopPropagation(); setBearbeitet(g); setModal(true); }}
                  className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
                  title="Bearbeiten"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); loeschen(g); }}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Löschen"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <GremiumModal
          gremium={bearbeitet}
          onSchliessen={() => setModal(false)}
          onErfolg={() => { setModal(false); liste_laden(); }}
        />
      )}
    </div>
  );
}

// ── Detailansicht: gemischte Sitzungen + Fremdprotokolle ───────────
function GremiumDetail({
  gremium, onZurueck, onGeaendert,
}: { gremium: Gremium; onZurueck: () => void; onGeaendert: (g: Gremium) => void }) {
  const [sitzungen, setSitzungen]       = useState<SitzungListItem[]>([]);
  const [protokolle, setProtokolle]     = useState<Fremdprotokoll[]>([]);
  const [laden, setLaden]               = useState(true);
  const [uploadModal, setUploadModal]   = useState(false);
  const [bearbeitetesProtokoll, setBearbeitetesProtokoll] = useState<Fremdprotokoll | null>(null);
  const [gremiumModal, setGremiumModal] = useState(false);

  function laden_() {
    setLaden(true);
    Promise.all([
      api.sitzungen.liste(),
      api.fremdprotokolle.liste(gremium.id),
    ])
      .then(([alleSitzungen, p]) => {
        setSitzungen(alleSitzungen.filter(s => s.gremium?.id === gremium.id));
        setProtokolle(p);
      })
      .catch(console.error)
      .finally(() => setLaden(false));
  }

  useEffect(laden_, [gremium.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function protokollLoeschen(p: Fremdprotokoll) {
    if (!confirm(`Fremdprotokoll "${p.titel}" wirklich löschen?`)) return;
    try {
      await api.fremdprotokolle.loeschen(p.id);
      laden_();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Löschen");
    }
  }

  type Eintrag =
    | { typ: "sitzung"; datum: string; sitzung: SitzungListItem }
    | { typ: "fremdprotokoll"; datum: string; protokoll: Fremdprotokoll };

  const eintraege: Eintrag[] = [
    ...sitzungen.map(s => ({ typ: "sitzung" as const, datum: s.sitzungsdatum, sitzung: s })),
    ...protokolle.map(p => ({ typ: "fremdprotokoll" as const, datum: p.datum, protokoll: p })),
  ].sort((a, b) => b.datum.localeCompare(a.datum));

  return (
    <div className="p-6">
      <div className="flex items-start gap-4 mb-6">
        <button onClick={onZurueck} className="mt-1 text-gray-400 hover:text-gray-600 shrink-0">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{gremium.name}</h1>
            {!gremium.aktiv && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-gray-200 bg-gray-100 text-gray-500">Inaktiv</span>
            )}
            <button
              onClick={() => setGremiumModal(true)}
              title="Gremium bearbeiten"
              className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
            >
              <Edit3 size={15} />
            </button>
          </div>
          {gremium.rechtsgrundlage && <p className="text-sm text-gray-500 mt-1">{gremium.rechtsgrundlage}</p>}
          {gremium.bemerkung && <p className="text-sm text-gray-500 mt-1">{gremium.bemerkung}</p>}
        </div>
        <button
          onClick={() => { setBearbeitetesProtokoll(null); setUploadModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:brightness-90 transition-colors shrink-0"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          <Upload size={16} /> Fremdprotokoll hochladen
        </button>
      </div>

      <MitgliederKarte gremiumId={gremium.id} />

      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : eintraege.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CalendarDays size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Noch keine Sitzungen oder Fremdprotokolle für dieses Gremium</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50">
          {eintraege.map(e => e.typ === "sitzung" ? (
            <Link
              key={`s-${e.sitzung.id}`}
              to={`/sitzungen?id=${e.sitzung.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <CalendarDays size={16} className="text-gray-400 shrink-0" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">{e.sitzung.titel}</p>
                  <p className="text-xs text-gray-400">
                    {formatDatum(e.sitzung.sitzungsdatum)} · {SITZUNGSTYP_LABEL[e.sitzung.sitzungstyp] ?? e.sitzung.sitzungstyp} · Sitzung im System
                  </p>
                </div>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">{sitzungStatusLabel(e.sitzung.status, e.sitzung.sitzungstyp)}</span>
            </Link>
          ) : (
            <div key={`f-${e.protokoll.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <FileText size={16} className="text-gray-400 shrink-0" />
                <div>
                  <p className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                    {e.protokoll.titel}
                    {e.protokoll.vertraulich && <span title="Vertraulich"><Lock size={12} className="text-amber-500" /></span>}
                  </p>
                  <p className="text-xs text-gray-400">{formatDatum(e.protokoll.datum)} · Fremdprotokoll</p>
                  {e.protokoll.bemerkung && <p className="text-xs text-gray-400 mt-0.5">{e.protokoll.bemerkung}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => fremdprotokollHerunterladen(e.protokoll.id, e.protokoll.dateiname)}
                  title="Herunterladen"
                  className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => { setBearbeitetesProtokoll(e.protokoll); setUploadModal(true); }}
                  title="Bearbeiten"
                  className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={() => protokollLoeschen(e.protokoll)}
                  title="Löschen"
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadModal && (
        <FremdprotokollModal
          gremiumId={gremium.id}
          bearbeitet={bearbeitetesProtokoll}
          onSchliessen={() => setUploadModal(false)}
          onErfolg={() => { setUploadModal(false); laden_(); }}
        />
      )}
      {gremiumModal && (
        <GremiumModal
          gremium={gremium}
          onSchliessen={() => setGremiumModal(false)}
          onErfolg={(g) => { setGremiumModal(false); onGeaendert(g); }}
        />
      )}
    </div>
  );
}

// ── Mitgliederliste eines Gremiums ─────────────────────────────────
// Steuert u.a. die automatische Anwesenheits-Vorausfüllung einer Sitzung dieses
// Gremiums (siehe backend/src/lib/sitzungAnlegen.ts) – ohne Mitglieder bleibt die
// Anwesenheitsliste bewusst leer statt auf alle BR-Mitglieder zurückzufallen.
function MitgliederKarte({ gremiumId }: { gremiumId: string }) {
  const [mitglieder, setMitglieder] = useState<GremiumMitglied[]>([]);
  const [alleBenutzer, setAlleBenutzer] = useState<Benutzer[]>([]);
  const [laden, setLaden]           = useState(true);
  const [neuesId, setNeuesId]       = useState("");
  const [speichert, setSpeichert]   = useState(false);

  function laden_() {
    setLaden(true);
    Promise.all([
      api.gremien.mitglieder(gremiumId),
      api.get<Benutzer[]>("/api/benutzer"),
    ])
      .then(([m, b]) => { setMitglieder(m); setAlleBenutzer(b); })
      .catch(console.error)
      .finally(() => setLaden(false));
  }

  useEffect(laden_, [gremiumId]); // eslint-disable-line react-hooks/exhaustive-deps

  const auswahl = alleBenutzer.filter(b => b.aktiv && !mitglieder.some(m => m.id === b.id));

  async function hinzufuegen() {
    if (!neuesId) return;
    setSpeichert(true);
    try {
      await api.gremien.mitgliedHinzufuegen(gremiumId, neuesId);
      setNeuesId("");
      laden_();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Hinzufügen");
    } finally {
      setSpeichert(false);
    }
  }

  async function entfernen(benutzerId: string) {
    try {
      await api.gremien.mitgliedEntfernen(gremiumId, benutzerId);
      laden_();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Entfernen");
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Users size={15} className="text-gray-400" /> Mitglieder
      </h2>
      {laden ? (
        <div className="flex items-center text-gray-400 text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Lade…
        </div>
      ) : (
        <>
          {mitglieder.length === 0 ? (
            <p className="text-sm text-gray-400 mb-3">
              Noch keine Mitglieder – die Anwesenheit einer Sitzung dieses Gremiums wird dann nicht automatisch vorausgefüllt.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {mitglieder.map(m => (
                <span key={m.id} className="inline-flex items-center gap-1.5 text-xs font-medium pl-2.5 pr-1 py-1 rounded-full bg-gray-50 border border-gray-200">
                  {m.name}
                  <span className={`px-1.5 py-0.5 rounded-full ${ROLLEN_FARBE[m.rolle]}`}>{ROLLEN_LABEL[m.rolle]}</span>
                  <button onClick={() => entfernen(m.id)} title="Entfernen" className="text-gray-400 hover:text-red-600 ml-0.5">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <select value={neuesId} onChange={e => setNeuesId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]">
              <option value="">Mitglied hinzufügen…</option>
              {auswahl.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button onClick={hinzufuegen} disabled={!neuesId || speichert}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:brightness-90 disabled:opacity-50 transition-colors"
              style={{ backgroundColor: "rgb(var(--accent))" }}>
              {speichert ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Hinzufügen
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Modal: Gremium anlegen / bearbeiten ────────────────────────────
function GremiumModal({
  gremium, onSchliessen, onErfolg,
}: {
  gremium: Gremium | null;
  onSchliessen: () => void;
  onErfolg: (g: Gremium) => void;
}) {
  const [name, setName]                     = useState(gremium?.name ?? "");
  const [rechtsgrundlage, setRechtsgrundlage] = useState(gremium?.rechtsgrundlage ?? "");
  const [bemerkung, setBemerkung]           = useState(gremium?.bemerkung ?? "");
  const [aktiv, setAktiv]                   = useState(gremium?.aktiv ?? true);
  const [laden, setLaden]                   = useState(false);
  const [fehler, setFehler]                 = useState("");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setFehler("Name ist Pflicht"); return; }
    setFehler("");
    setLaden(true);
    try {
      const daten = {
        name: name.trim(),
        rechtsgrundlage: rechtsgrundlage.trim() || undefined,
        bemerkung: bemerkung.trim() || undefined,
        aktiv,
      };
      const ergebnis = gremium
        ? await api.gremien.aktualisieren(gremium.id, daten)
        : await api.gremien.erstellen(daten);
      onErfolg(ergebnis);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{gremium ? "Gremium bearbeiten" : "Neues Gremium"}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={speichern} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" required value={name} autoFocus onChange={e => setName(e.target.value)}
              placeholder="z.B. Arbeitsschutzausschuss (ASA)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rechtsgrundlage</label>
            <input type="text" value={rechtsgrundlage} onChange={e => setRechtsgrundlage(e.target.value)}
              placeholder="z.B. § 28 BetrVG"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bemerkung</label>
            <textarea rows={2} value={bemerkung} onChange={e => setBemerkung(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y" />
          </div>

          {gremium && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={aktiv} onChange={e => setAktiv(e.target.checked)}
                className="rounded border-gray-300" />
              Aktiv (inaktive Gremien werden in der Sitzungsanlage nicht mehr vorgeschlagen)
            </label>
          )}

          {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Abbrechen
            </button>
            <button type="submit" disabled={laden}
              className="flex-1 hover:brightness-90 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: "rgb(var(--accent))" }}>
              {laden && <Loader2 size={14} className="animate-spin" />}
              {gremium ? "Speichern" : "Erstellen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal: Fremdprotokoll hochladen / bearbeiten ───────────────────
function FremdprotokollModal({
  gremiumId, bearbeitet, onSchliessen, onErfolg,
}: {
  gremiumId: string;
  bearbeitet: Fremdprotokoll | null;
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [titel, setTitel]         = useState(bearbeitet?.titel ?? "");
  const [datum, setDatum]         = useState(bearbeitet?.datum?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [bemerkung, setBemerkung] = useState(bearbeitet?.bemerkung ?? "");
  const [vertraulich, setVertraulich] = useState(bearbeitet?.vertraulich ?? false);
  const [datei, setDatei]         = useState<File | null>(null);
  const [laden, setLaden]         = useState(false);
  const [fehler, setFehler]       = useState("");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim()) { setFehler("Titel ist Pflicht"); return; }
    if (!datum)         { setFehler("Datum ist Pflicht"); return; }
    if (!bearbeitet && !datei) { setFehler("Bitte eine Datei auswählen"); return; }
    setFehler("");
    setLaden(true);
    try {
      if (bearbeitet) {
        await api.fremdprotokolle.aktualisieren(bearbeitet.id, {
          titel: titel.trim(), datum, bemerkung: bemerkung.trim() || null, vertraulich,
        });
      } else {
        const formData = new FormData();
        formData.append("datei", datei!);
        formData.append("gremiumId", gremiumId);
        formData.append("datum", datum);
        formData.append("titel", titel.trim());
        if (bemerkung.trim()) formData.append("bemerkung", bemerkung.trim());
        formData.append("vertraulich", vertraulich ? "true" : "false");
        await api.fremdprotokolle.hochladen(formData);
      }
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{bearbeitet ? "Fremdprotokoll bearbeiten" : "Fremdprotokoll hochladen"}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={speichern} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input type="text" required value={titel} autoFocus onChange={e => setTitel(e.target.value)}
              placeholder="z.B. Protokoll ASA-Sitzung März 2026"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Datum *</label>
            <input type="date" required value={datum} onChange={e => setDatum(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>

          {!bearbeitet && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Datei * (PDF, JPG, PNG, DOCX)</label>
              <input type="file" required accept=".pdf,.jpg,.jpeg,.png,.docx,.docm"
                onChange={e => setDatei(e.target.files?.[0] ?? null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bemerkung</label>
            <textarea rows={2} value={bemerkung} onChange={e => setBemerkung(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y" />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={vertraulich} onChange={e => setVertraulich(e.target.checked)}
              className="rounded border-gray-300" />
            Vertraulich (nur Vorsitz/Admin können es ansehen und herunterladen)
          </label>

          {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Abbrechen
            </button>
            <button type="submit" disabled={laden}
              className="flex-1 hover:brightness-90 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: "rgb(var(--accent))" }}>
              {laden && <Loader2 size={14} className="animate-spin" />}
              {bearbeitet ? "Speichern" : "Hochladen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
