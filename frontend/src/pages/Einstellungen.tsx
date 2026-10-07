import { useEffect, useRef, useState } from "react";
import { Settings, Save, Loader2, RotateCcw, Users, Clock, FileText, Upload, Trash2, Palette, Download, FolderOpen, CheckCircle2, XCircle, Puzzle, Scale, RefreshCw, AlertTriangle } from "lucide-react";
import { api, WatchfolderLogEintrag, Aufbewahrungsregel, ProtokollEinstellungen, KATEGORIE_LABEL, DesignEinstellungen, Rolle, ModuleKey, MODULE_KEYS, MODULE_LABEL, GesetzStatus, Geschlecht } from "../lib/api";
import BenutzerVerwaltung from "./Benutzer";

type Tab = "fristen" | "benutzer" | "protokoll" | "design" | "system" | "module" | "gesetze" | "amtsuebergabe";

function tageZuText(tage: number): string {
  if (tage % 365 === 0) return `${tage / 365} Jahr${tage / 365 !== 1 ? "e" : ""}`;
  if (tage % 30 === 0)  return `${tage / 30} Monat${tage / 30 !== 1 ? "e" : ""}`;
  return `${tage} Tage`;
}

function RegelZeile({
  regel,
  onGespeichert,
}: {
  regel: Aufbewahrungsregel;
  onGespeichert: (r: Aufbewahrungsregel) => void;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [tage, setTage]             = useState(String(regel.tage));
  const [rg, setRg]                 = useState(regel.rechtsgrundlage ?? "");
  const [beschr, setBeschr]         = useState(regel.beschreibung ?? "");
  const [laden, setLaden]           = useState(false);
  const [fehler, setFehler]         = useState("");

  async function speichern() {
    const tageZahl = parseInt(tage, 10);
    if (!tageZahl || tageZahl < 1) { setFehler("Muss mindestens 1 Tag sein"); return; }
    setFehler(""); setLaden(true);
    try {
      const neu = await api.einstellungen.aufbewahrungSpeichern(regel.kategorie, {
        tage:            tageZahl,
        rechtsgrundlage: rg || undefined,
        beschreibung:    beschr || undefined,
      });
      onGespeichert({ ...neu, istStandard: false });
      setBearbeiten(false);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  if (!bearbeiten) {
    return (
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-gray-900">{KATEGORIE_LABEL[regel.kategorie as keyof typeof KATEGORIE_LABEL] ?? regel.kategorie}</p>
          {regel.beschreibung && <p className="text-xs text-gray-400 mt-0.5">{regel.beschreibung}</p>}
        </td>
        <td className="px-4 py-3 hidden sm:table-cell">
          <span className="text-sm text-gray-800 font-medium">{tageZuText(regel.tage)}</span>
          <span className="text-xs text-gray-400 ml-1">({regel.tage} Tage)</span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{regel.rechtsgrundlage ?? "—"}</td>
        <td className="px-4 py-3 hidden sm:table-cell">
          {regel.istStandard ? (
            <span className="text-xs text-gray-400 italic">Standardwert</span>
          ) : (
            <span className="text-xs text-[rgb(var(--accent))] font-medium">Angepasst</span>
          )}
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => setBearbeiten(true)}
            className="text-sm text-[rgb(var(--accent))] hover:brightness-75 font-medium"
          >
            Bearbeiten
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-[rgb(var(--accent)/0.05)]">
      <td className="px-4 py-3" colSpan={5}>
        <p className="text-sm font-semibold text-gray-800 mb-3">
          {KATEGORIE_LABEL[regel.kategorie as keyof typeof KATEGORIE_LABEL] ?? regel.kategorie}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Aufbewahrungsfrist (Tage) *</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={tage}
                onChange={e => setTage(e.target.value)}
                className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
              {tage && parseInt(tage) > 0 && (
                <span className="text-xs text-gray-500">= {tageZuText(parseInt(tage))}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">365 = 1 Jahr · 730 = 2 Jahre</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rechtsgrundlage</label>
            <input
              value={rg}
              onChange={e => setRg(e.target.value)}
              placeholder="z. B. § 99 BetrVG"
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Beschreibung (optional)</label>
            <input
              value={beschr}
              onChange={e => setBeschr(e.target.value)}
              placeholder="z. B. Personalakte Kündigung"
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
          </div>
        </div>
        {fehler && <p className="text-xs text-red-600 mb-2">{fehler}</p>}
        <div className="flex gap-2">
          <button
            onClick={speichern}
            disabled={laden}
            className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg"
          >
            {laden ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Speichern
          </button>
          <button
            onClick={() => { setBearbeiten(false); setTage(String(regel.tage)); setRg(regel.rechtsgrundlage ?? ""); setBeschr(regel.beschreibung ?? ""); setFehler(""); }}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm px-3 py-1.5 rounded-lg"
          >
            <RotateCcw size={13} /> Abbrechen
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Protokoll-Tab ─────────────────────────────────────────────────
const PROTOKOLL_DEFAULTS: ProtokollEinstellungen = {
  kopfzeile:            "Betriebsrat",
  unterzeile:           "Internes Dokumentenmanagementsystem",
  farbe:                "#1e40af",
  fusszeile:            "BR-DMS – Vertraulich",
  unterschrift_vorsitz: "Vorsitzende/r des Betriebsrats",
  unterschrift_zeuge:   "Betriebsratsmitglied (Protokollzeugin/-zeuge)",
  unterschrift_ort:     "",
  kopfzeile_layout:     "logo_links",
  fusszeile_layout:     "text_links",
  hat_logo:             "false",
};

// ── Layout-Picker Vorschauen ──────────────────────────────────────
function KopfzeileVorschau({ typ, farbe }: { typ: string; farbe: string }) {
  return (
    <svg viewBox="0 0 110 52" className="w-full" style={{ display: "block" }}>
      <rect width="110" height="52" fill="#f9fafb" rx="3" />
      {typ === "logo_links" && <>
        <rect x="3" y="4" width="18" height="18" rx="2" fill="#e5e7eb" />
        <rect x="24" y="5"  width="36" height="4" rx="1" fill={farbe} />
        <rect x="24" y="13" width="26" height="3" rx="1" fill="#d1d5db" />
        <rect x="24" y="19" width="20" height="2" rx="1" fill="#e5e7eb" />
      </>}
      {typ === "logo_rechts" && <>
        <rect x="3"  y="4"  width="3"  height="18" rx="1" fill={farbe} />
        <rect x="9"  y="5"  width="36" height="4"  rx="1" fill={farbe} />
        <rect x="9"  y="13" width="26" height="3"  rx="1" fill="#d1d5db" />
        <rect x="9"  y="19" width="20" height="2"  rx="1" fill="#e5e7eb" />
        <rect x="52" y="4"  width="18" height="18" rx="2" fill="#e5e7eb" />
      </>}
      {typ === "balken" && <>
        <rect x="3" y="4"  width="4"  height="18" rx="1" fill={farbe} />
        <rect x="11" y="5"  width="36" height="4"  rx="1" fill={farbe} />
        <rect x="11" y="13" width="26" height="3"  rx="1" fill="#d1d5db" />
        <rect x="11" y="19" width="20" height="2"  rx="1" fill="#e5e7eb" />
      </>}
      {/* Badge rechts */}
      <rect x="79" y="4" width="28" height="10" rx="2" fill={farbe} opacity="0.7" />
      {/* Trennlinie */}
      <line x1="3" y1="30" x2="107" y2="30" stroke="#e2e8f0" strokeWidth="1" />
      {/* Titelzeile */}
      <rect x="3" y="34" width="50" height="4" rx="1" fill="#374151" />
    </svg>
  );
}

function FusszeilleVorschau({ typ, farbe }: { typ: string; farbe: string }) {
  return (
    <svg viewBox="0 0 110 28" className="w-full" style={{ display: "block" }}>
      <rect width="110" height="28" fill="#f9fafb" rx="3" />
      <line x1="3" y1="10" x2="107" y2="10" stroke="#e2e8f0" strokeWidth="1" />
      {typ === "text_links" && <>
        <rect x="3"  y="14" width="45" height="3" rx="1" fill="#9ca3af" />
        <rect x="80" y="14" width="27" height="3" rx="1" fill="#9ca3af" />
      </>}
      {typ === "text_rechts" && <>
        <rect x="3"  y="14" width="27" height="3" rx="1" fill="#9ca3af" />
        <rect x="62" y="14" width="45" height="3" rx="1" fill="#9ca3af" />
      </>}
    </svg>
  );
}

function ProtokollTab() {
  const [einstellungen, setEinstellungen] = useState<ProtokollEinstellungen>(PROTOKOLL_DEFAULTS);
  const [laden, setLaden]   = useState(true);
  const [fehler, setFehler] = useState("");
  const [gespeichert, setGespeichert] = useState(false);
  const [speichern, setSpeichern] = useState(false);
  const [logoLaden, setLogoLaden] = useState(false);
  const [logoKey, setLogoKey] = useState(0);
  const dateiInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.einstellungen.protokoll()
      .then(setEinstellungen)
      .catch(() => setFehler("Serververbindung fehlgeschlagen – Standardwerte werden angezeigt. Bitte prüfe ob 'prisma db push' ausgeführt wurde."))
      .finally(() => setLaden(false));
  }, []);

  function aendern(feld: keyof Omit<ProtokollEinstellungen, "hat_logo">, wert: string) {
    setEinstellungen(prev => ({ ...prev, [feld]: wert }));
    setGespeichert(false);
  }

  async function speichernKlick() {
    setFehler(""); setSpeichern(true);
    try {
      const { hat_logo: _, ...daten } = einstellungen;
      await api.einstellungen.protokollSpeichern(daten);
      setGespeichert(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSpeichern(false);
    }
  }

  async function logoHochladen(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    const formData = new FormData();
    formData.append("file", datei);
    setLogoLaden(true); setFehler("");
    try {
      await api.einstellungen.logoHochladen(formData);
      setEinstellungen(prev => prev ? { ...prev, hat_logo: "true" } : prev);
      setLogoKey(k => k + 1);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Hochladen");
    } finally {
      setLogoLaden(false);
      if (dateiInputRef.current) dateiInputRef.current.value = "";
    }
  }

  async function logoLoeschen() {
    setLogoLaden(true); setFehler("");
    try {
      await api.einstellungen.logoLoeschen();
      setEinstellungen(prev => prev ? { ...prev, hat_logo: "false" } : prev);
      setLogoKey(k => k + 1);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Löschen");
    } finally {
      setLogoLaden(false);
    }
  }

  const feld = (label: string, key: keyof Omit<ProtokollEinstellungen, "hat_logo">, placeholder?: string) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        value={einstellungen?.[key] ?? ""}
        onChange={e => aendern(key, e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
      />
    </div>
  );

  if (laden) return (
    <div className="flex items-center justify-center h-32 text-gray-400">
      <Loader2 className="animate-spin mr-2" size={18} /> Laden…
    </div>
  );

  return (
    <div className="space-y-6">
      {fehler && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
          {fehler}
        </div>
      )}

      {/* Logo */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Logo</h2>
        <p className="text-sm text-gray-500 mb-4">Wird oben links im PDF angezeigt (PNG oder JPG, max. 2 MB).</p>

        <div className="flex items-center gap-4">
          {einstellungen.hat_logo === "true" ? (
            <>
              <img
                key={logoKey}
                src={`${api.einstellungen.logoUrl()}?v=${logoKey}`}
                alt="Logo"
                className="h-16 w-auto border border-gray-200 rounded-lg p-1 object-contain"
              />
              <button
                onClick={logoLoeschen}
                disabled={logoLaden}
                className="flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm px-3 py-1.5 rounded-lg"
              >
                {logoLaden ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Logo entfernen
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">Kein Logo hinterlegt – es wird ein farbiger Balken angezeigt.</p>
          )}
          <input ref={dateiInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={logoHochladen} />
          <button
            onClick={() => dateiInputRef.current?.click()}
            disabled={logoLaden}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-sm px-3 py-1.5 rounded-lg"
          >
            {logoLaden ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {einstellungen.hat_logo === "true" ? "Logo ersetzen" : "Logo hochladen"}
          </button>
        </div>
      </div>

      {/* Layout-Picker */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Layout</h2>
        <p className="text-sm text-gray-500 mb-4">Anordnung von Logo, Text und Seitenzahl in Kopf- und Fußzeile.</p>

        <p className="text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">Kopfzeile</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          {([
            { wert: "logo_links",  label: "Logo links" },
            { wert: "logo_rechts", label: "Logo rechts" },
            { wert: "balken",      label: "Kein Logo" },
          ] as const).map(({ wert, label }) => (
            <button
              key={wert}
              onClick={() => aendern("kopfzeile_layout", wert)}
              className={`rounded-lg border-2 p-2 text-left transition-colors ${
                einstellungen.kopfzeile_layout === wert
                  ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.1)]"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <KopfzeileVorschau typ={wert} farbe={einstellungen.farbe} />
              <p className={`text-xs text-center mt-1.5 font-medium ${
                einstellungen.kopfzeile_layout === wert ? "text-accent" : "text-gray-500"
              }`}>{label}</p>
            </button>
          ))}
        </div>

        <p className="text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">Fußzeile</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { wert: "text_links",  label: "Bezeichnung links · Seite rechts" },
            { wert: "text_rechts", label: "Seite links · Bezeichnung rechts" },
          ] as const).map(({ wert, label }) => (
            <button
              key={wert}
              onClick={() => aendern("fusszeile_layout", wert)}
              className={`rounded-lg border-2 p-2 text-left transition-colors ${
                einstellungen.fusszeile_layout === wert
                  ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.1)]"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <FusszeilleVorschau typ={wert} farbe={einstellungen.farbe} />
              <p className={`text-xs text-center mt-1.5 font-medium ${
                einstellungen.fusszeile_layout === wert ? "text-accent" : "text-gray-500"
              }`}>{label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Texte & Farbe */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Kopfzeile & Farbe</h2>
        <p className="text-sm text-gray-500 mb-4">Erscheint im Briefkopf aller generierten PDFs.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {feld("Kopfzeile (groß)", "kopfzeile", "z. B. Betriebsrat")}
          {feld("Unterzeile (klein)", "unterzeile", "z. B. Firma XY GmbH")}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Akzentfarbe</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={einstellungen?.farbe ?? "#1e40af"}
              onChange={e => aendern("farbe", e.target.value)}
              className="h-9 w-16 rounded-lg border border-gray-300 cursor-pointer p-0.5"
            />
            <input
              value={einstellungen?.farbe ?? ""}
              onChange={e => aendern("farbe", e.target.value)}
              placeholder="#1e40af"
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
            <span className="text-xs text-gray-400">Wird für Überschriften, Trennlinien und den Badge verwendet.</span>
          </div>
        </div>
      </div>

      {/* Fußzeile & Unterschriften */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Fußzeile & Unterschriften</h2>
        <p className="text-sm text-gray-500 mb-4">Text für Fußzeile und Unterschriftslinien im PDF.</p>

        <div className="grid grid-cols-1 gap-4">
          {feld("Fußzeilen-Text", "fusszeile", "z. B. BR-DMS – Vertraulich")}
          {feld("Unterschrift Vorsitz", "unterschrift_vorsitz", "z. B. Vorsitzende/r des Betriebsrats")}
          {feld("Unterschrift Zeuge/Zeugin", "unterschrift_zeuge", "z. B. Betriebsratsmitglied (Protokollzeugin/-zeuge)")}
          {feld("Ort bei der Unterschrift", "unterschrift_ort", "z. B. Musterstadt – leer lassen für nur das Datum")}
        </div>
      </div>

      {/* Aktionsleiste */}
      {gespeichert && <p className="text-sm text-green-600">Gespeichert. Gilt für alle neu generierten PDFs.</p>}
      <div className="flex justify-end">
        <button
          onClick={speichernKlick}
          disabled={speichern}
          className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
        >
          {speichern ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Speichern
        </button>
      </div>
    </div>
  );
}

// ── Design Tab ────────────────────────────────────────────────────
const THEMES: { name: string; sidebar: string; accent: string; text: string; bg: string }[] = [
  { name: "Board",     sidebar: "#222327", accent: "#222327", text: "#222327", bg: "#f3f3f4" },
  { name: "Board Rot", sidebar: "#222327", accent: "#c8102e", text: "#222327", bg: "#f3f3f4" },
  { name: "Ozean",     sidebar: "#1e3a5f", accent: "#2563eb", text: "#111827", bg: "#f9fafb" },
  { name: "Schiefer",  sidebar: "#1e293b", accent: "#0ea5e9", text: "#111827", bg: "#f8fafc" },
  { name: "Wald",      sidebar: "#14532d", accent: "#16a34a", text: "#111827", bg: "#f0fdf4" },
  { name: "Weinrot",   sidebar: "#4c0519", accent: "#e11d48", text: "#111827", bg: "#fff1f2" },
  { name: "Bernstein", sidebar: "#451a03", accent: "#d97706", text: "#111827", bg: "#fffbeb" },
  { name: "Violett",   sidebar: "#2e1065", accent: "#7c3aed", text: "#111827", bg: "#faf5ff" },
  { name: "Graphit",   sidebar: "#18181b", accent: "#6366f1", text: "#111827", bg: "#fafafa" },
  { name: "Indigo",    sidebar: "#1e1b4b", accent: "#4f46e5", text: "#111827", bg: "#eef2ff" },
];

function ThemeKarte({ theme, aktiv, onClick }: { theme: typeof THEMES[0]; aktiv: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 p-1.5 transition-all hover:scale-105 ${
        aktiv ? "border-[rgb(var(--accent))] ring-2 ring-[rgb(var(--accent)/0.3)]" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex h-12 rounded-lg overflow-hidden">
        <div className="w-8 flex-shrink-0 flex flex-col gap-1 p-1" style={{ backgroundColor: theme.sidebar }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-1.5 rounded-sm opacity-60" style={{ backgroundColor: "white", width: i === 0 ? "100%" : "70%" }} />
          ))}
        </div>
        <div className="flex-1 flex flex-col gap-1 p-1.5" style={{ backgroundColor: theme.bg }}>
          <div className="h-2 rounded-sm w-3/4" style={{ backgroundColor: theme.text, opacity: 0.2 }} />
          <div className="h-2 rounded-sm w-1/2" style={{ backgroundColor: theme.text, opacity: 0.12 }} />
          <div className="mt-auto h-2.5 rounded-sm w-2/3" style={{ backgroundColor: theme.accent, opacity: 0.85 }} />
        </div>
      </div>
      <p className={`text-xs text-center mt-1.5 font-medium ${aktiv ? "text-[rgb(var(--accent))]" : "text-gray-500"}`}>
        {theme.name}
      </p>
    </button>
  );
}

function DesignTab() {
  const [einstellungen, setEinst] = useState<DesignEinstellungen>({
    sidebar_farbe: "#222327", akzent_farbe: "#222327",
    text_farbe: "#222327", hintergrund: "#f3f3f4",
    schrift_groesse: "16", dark_mode: "auto",
  });
  const [laden, setLaden] = useState(true);
  const [speichern, setSpeichern] = useState(false);

  useEffect(() => {
    api.einstellungen.design()
      .then(setEinst)
      .catch(() => {})
      .finally(() => setLaden(false));
  }, []);

  function aendern(feld: keyof DesignEinstellungen, wert: string) {
    setEinst(prev => ({ ...prev, [feld]: wert }));
  }

  function themeAnwenden(t: typeof THEMES[0]) {
    setEinst(prev => ({ ...prev, sidebar_farbe: t.sidebar, akzent_farbe: t.accent, text_farbe: t.text, hintergrund: t.bg }));
  }

  function aktivesTheme(): string | null {
    return THEMES.find(t =>
      t.sidebar === einstellungen.sidebar_farbe &&
      t.accent  === einstellungen.akzent_farbe  &&
      t.text    === einstellungen.text_farbe    &&
      t.bg      === einstellungen.hintergrund
    )?.name ?? null;
  }

  async function speichernKlick() {
    setSpeichern(true);
    try {
      await api.einstellungen.designSpeichern(einstellungen);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
      setSpeichern(false);
    }
  }

  if (laden) return <div className="flex items-center justify-center h-32 text-gray-400"><Loader2 className="animate-spin mr-2" size={18} /> Laden…</div>;

  const inputKlasse = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";
  const aktiv = aktivesTheme();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Farbschema</h2>
        <p className="text-sm text-gray-500 mb-4">Ein Klick setzt alle Farben auf einmal.</p>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {THEMES.map(t => (
            <ThemeKarte key={t.name} theme={t} aktiv={aktiv === t.name} onClick={() => themeAnwenden(t)} />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Farben anpassen</h2>
        <p className="text-sm text-gray-500 mb-4">Einzelne Farben individuell überschreiben.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([
            ["sidebar_farbe", "Sidebar-Hintergrund"],
            ["akzent_farbe",  "Akzent (Buttons, Links)"],
            ["text_farbe",    "Textfarbe"],
            ["hintergrund",   "Seiten-Hintergrund"],
          ] as [keyof DesignEinstellungen, string][]).map(([key, label]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <div className="flex gap-2">
                <input type="color" value={einstellungen[key]}
                  onChange={e => aendern(key, e.target.value)}
                  className="w-10 h-9 border border-gray-300 rounded cursor-pointer shrink-0" />
                <input type="text" value={einstellungen[key]}
                  onChange={e => aendern(key, e.target.value)}
                  className={inputKlasse} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Darstellung</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dark Mode</label>
            <select value={einstellungen.dark_mode} onChange={e => aendern("dark_mode", e.target.value)} className={inputKlasse}>
              <option value="auto">Automatisch (System)</option>
              <option value="light">Hell</option>
              <option value="dark">Dunkel</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Schriftgröße: {einstellungen.schrift_groesse}px
            </label>
            <input type="range" min="12" max="24" value={einstellungen.schrift_groesse}
              onChange={e => aendern("schrift_groesse", e.target.value)}
              className="w-full" />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>12px</span><span>24px</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Vorschau</h2>
        <div className="flex rounded-xl overflow-hidden border border-gray-200 h-20 shadow-inner">
          <div className="w-24 flex flex-col gap-1 p-2" style={{ backgroundColor: einstellungen.sidebar_farbe }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-2 rounded-sm opacity-50" style={{ backgroundColor: "white", width: i === 0 ? "80%" : i === 1 ? "60%" : i === 2 ? "70%" : "50%" }} />
            ))}
          </div>
          <div className="flex-1 flex items-center justify-center gap-3 px-4" style={{ backgroundColor: einstellungen.hintergrund }}>
            <span className="text-sm font-medium" style={{ color: einstellungen.text_farbe }}>Beispieltext</span>
            <span className="text-xs text-white px-3 py-1.5 rounded-lg font-medium shadow-sm"
              style={{ backgroundColor: einstellungen.akzent_farbe }}>
              Button
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={speichernKlick} disabled={speichern}
          className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm">
          {speichern && <Loader2 size={14} className="animate-spin" />}
          <Save size={14} /> Speichern & neu laden
        </button>
      </div>
    </div>
  );
}

// ── Gefahrenzone: eine Löschaktion mit "LÖSCHEN"-Eintipp-Bestätigung ─
function GefahrenzonenAktion({
  titel, beschreibung, buttonText, ausfuehren, erfolgText,
}: {
  titel: string;
  beschreibung: string;
  buttonText: string;
  ausfuehren: () => Promise<{ [k: string]: unknown }>;
  erfolgText: (ergebnis: { [k: string]: unknown }) => string;
}) {
  const [bestaetigung, setBestaetigung] = useState("");
  const [laden, setLaden]               = useState(false);
  const [fehler, setFehler]             = useState("");
  const [erfolg, setErfolg]             = useState("");

  const freigeschaltet = bestaetigung.trim().toUpperCase() === "LÖSCHEN";

  async function starten() {
    if (!freigeschaltet) return;
    setLaden(true);
    setFehler("");
    setErfolg("");
    try {
      const ergebnis = await ausfuehren();
      setErfolg(erfolgText(ergebnis));
      setBestaetigung("");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="border border-red-200 rounded-lg px-4 py-3 space-y-2">
      <p className="font-medium text-red-800">{titel}</p>
      <p className="text-red-700 text-sm">{beschreibung}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <input
          type="text"
          value={bestaetigung}
          onChange={e => setBestaetigung(e.target.value)}
          placeholder='"LÖSCHEN" eintippen zum Freischalten'
          className="border border-red-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 w-64"
        />
        <button
          onClick={starten}
          disabled={!freigeschaltet || laden}
          className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          {laden && <Loader2 size={14} className="animate-spin" />}
          <Trash2 size={14} />
          {buttonText}
        </button>
      </div>
      {erfolg && <p className="text-green-700 text-sm">{erfolg}</p>}
      {fehler && <p className="text-red-700 text-sm">{fehler}</p>}
    </div>
  );
}

// ── Gefahrenzone: Eingruppierung löschen (nur ADMIN) ────────────────
function GehaltstabelleGefahrenzone() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={16} className="text-red-500" />
        <h2 className="font-semibold text-gray-800">Gefahrenzone – Eingruppierung</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Nur für Admins. Beide Aktionen können nicht rückgängig gemacht werden. Es gibt bewusst keinen Daten-Export aus der App
        (siehe unten) – vorher ggf. ein reguläres Datenbank-Backup ziehen (<code className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-1 py-0.5">./backup.sh</code>, siehe oben).
      </p>
      <div className="space-y-3">
        <GefahrenzonenAktion
          titel="Nur Gehaltsstufen-Einträge löschen"
          beschreibung="Löscht alle Gehaltsstufen-Einträge (z.B. um nach einem fehlerhaften Import mit inkonsistenter Stufen-Schreibweise neu zu importieren). Mitarbeiter und Abteilungen bleiben erhalten."
          buttonText="Nur Einträge löschen"
          ausfuehren={() => api.gehaltstabelle.eintraegeLoeschen()}
          erfolgText={r => `${r.geloescht && typeof r.geloescht === "object" && "eintraege" in r.geloescht ? (r.geloescht as { eintraege: number }).eintraege : "?"} Einträge gelöscht.`}
        />
        <GefahrenzonenAktion
          titel="Eingruppierung komplett löschen"
          beschreibung="Löscht alle Gehaltsstufen-Einträge, Mitarbeiter UND Abteilungen unwiderruflich. Für einen kompletten Neustart, z.B. nach Testdaten."
          buttonText="Alles löschen"
          ausfuehren={() => api.gehaltstabelle.alleLoeschen()}
          erfolgText={r => {
            const g = r.geloescht as { eintraege: number; mitarbeiter: number; abteilungen: number } | undefined;
            return g ? `${g.eintraege} Einträge, ${g.mitarbeiter} Mitarbeiter, ${g.abteilungen} Abteilungen gelöscht.` : "Gelöscht.";
          }}
        />
      </div>
    </div>
  );
}

// ── Sicherheit: Inaktivitäts-Timeout (nur ADMIN) ────────────────────
function SicherheitEinstellung() {
  const [minuten, setMinuten] = useState("30");
  const [laden, setLaden]     = useState(true);
  const [speichern, setSpeichern] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [fehler, setFehler]   = useState("");

  useEffect(() => {
    api.einstellungen.sicherheit()
      .then(s => setMinuten(String(s.inaktivitaetMinuten)))
      .catch(() => {})
      .finally(() => setLaden(false));
  }, []);

  async function speichernKlick() {
    const wert = parseInt(minuten, 10);
    if (!Number.isInteger(wert) || wert < 0 || wert > 480) {
      setFehler("Bitte eine Zahl zwischen 0 (deaktiviert) und 480 eingeben");
      return;
    }
    setFehler("");
    setSpeichern(true);
    setGespeichert(false);
    try {
      await api.einstellungen.sicherheitSpeichern(wert);
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 3000);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSpeichern(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h2 className="font-semibold text-gray-800 mb-1">Sicherheit</h2>
      <p className="text-sm text-gray-500 mb-4">
        Meldet inaktive Benutzer automatisch ab (kein Klick/Tastendruck/Scrollen). 0 = deaktiviert.
      </p>
      {laden ? (
        <div className="flex items-center text-gray-400 text-sm"><Loader2 size={16} className="animate-spin mr-2" /> Laden…</div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-sm text-gray-600">Automatisch abmelden nach</label>
          <input
            type="number" min={0} max={480} value={minuten}
            onChange={e => setMinuten(e.target.value)}
            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          />
          <span className="text-sm text-gray-600">Minuten Inaktivität</span>
          <button
            onClick={speichernKlick}
            disabled={speichern}
            className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ml-2"
          >
            {speichern && <Loader2 size={14} className="animate-spin" />}
            Speichern
          </button>
          {gespeichert && <span className="text-green-700 text-sm">Gespeichert.</span>}
        </div>
      )}
      {fehler && <p className="text-red-700 text-sm mt-2">{fehler}</p>}
    </div>
  );
}

// ── Wahlquote: Minderheitengeschlecht + Mindestsitze (§15 Abs. 2 BetrVG) ──
// Basis für den automatischen Ersatzmitglieder-Nachrück-Vorschlag in Sitzungen.
// ── Inhaltszugriff des Admins (nur Vorsitz/Stellvertretung ändern) ──
function AdminZugriffEinstellung({ darfAendern }: { darfAendern: boolean }) {
  const [inhaltszugriff, setInhaltszugriff] = useState<boolean | null>(null);
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler]       = useState("");

  useEffect(() => {
    api.einstellungen.adminZugriff().then(z => setInhaltszugriff(z.inhaltszugriff)).catch(() => {});
  }, []);

  async function umschalten(wert: boolean) {
    setFehler("");
    setSpeichern(true);
    try {
      const z = await api.einstellungen.adminZugriffSpeichern(wert);
      setInhaltszugriff(z.inhaltszugriff);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSpeichern(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-4">
      <h2 className="font-semibold text-gray-800 mb-1">Zugriff des Admins auf Inhalte</h2>
      <p className="text-sm text-gray-500 mb-4">
        Betreut jemand außerhalb des Gremiums die Technik (z. B. die IT), kann der Admin auf die Verwaltung
        beschränkt werden: Benutzer, Einstellungen, Module und Gesetzestexte. Sitzungen, Dokumente,
        Personaldaten, Aufgaben und das Audit-Log sind dann für ihn gesperrt.
        {darfAendern ? " Nur Vorsitz und Stellvertretung können das ändern." : " Festgelegt von Vorsitz oder Stellvertretung."}
      </p>
      {inhaltszugriff === null ? (
        <div className="flex items-center text-gray-400 text-sm"><Loader2 size={16} className="animate-spin mr-2" /> Laden…</div>
      ) : (
        <div className="flex flex-col gap-2">
          {[
            { wert: true,  label: "Voller Zugriff", text: "Der Admin sieht alles, wie Vorsitz (Standard)." },
            { wert: false, label: "Nur technische Verwaltung", text: "Der Admin sieht keine Inhalte des Gremiums." },
          ].map(o => (
            <label key={String(o.wert)} className={`flex items-start gap-2 text-sm ${darfAendern ? "cursor-pointer" : "opacity-70"}`}>
              <input
                type="radio"
                name="admin-inhaltszugriff"
                checked={inhaltszugriff === o.wert}
                disabled={!darfAendern || speichern}
                onChange={() => umschalten(o.wert)}
                className="mt-0.5 accent-[rgb(var(--accent))]"
              />
              <span><span className="font-medium text-gray-800">{o.label}</span> – <span className="text-gray-500">{o.text}</span></span>
            </label>
          ))}
          {!inhaltszugriff && (
            <p className="text-xs text-gray-500 mt-1">
              Legt der Admin ein neues Benutzerkonto an, bekommen Vorsitz und Stellvertretung eine Nachricht.
              Passwörter anderer setzt er nicht mehr zurück.
            </p>
          )}
        </div>
      )}
      {fehler && <p className="text-red-700 text-sm mt-2">{fehler}</p>}
    </div>
  );
}

function WahlQuoteEinstellung() {
  const [geschlecht, setGeschlecht]   = useState<Geschlecht | "">("");
  const [mindestsitze, setMindestsitze] = useState("0");
  const [laden, setLaden]             = useState(true);
  const [speichern, setSpeichern]     = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [fehler, setFehler]           = useState("");

  useEffect(() => {
    api.einstellungen.wahlquote()
      .then(w => {
        setGeschlecht(w.minderheitengeschlecht ?? "");
        setMindestsitze(String(w.mindestsitzeMinderheit));
      })
      .catch(() => {})
      .finally(() => setLaden(false));
  }, []);

  async function speichernKlick() {
    const wert = parseInt(mindestsitze, 10);
    if (!Number.isInteger(wert) || wert < 0) {
      setFehler("Mindestsitze muss eine Ganzzahl >= 0 sein");
      return;
    }
    setFehler("");
    setSpeichern(true);
    setGespeichert(false);
    try {
      await api.einstellungen.wahlquoteSpeichern({
        minderheitengeschlecht: geschlecht || null,
        mindestsitzeMinderheit: wert,
      });
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 3000);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSpeichern(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-4">
      <h2 className="font-semibold text-gray-800 mb-1">Geschlechterquote (§15 Abs. 2 BetrVG)</h2>
      <p className="text-sm text-gray-500 mb-4">
        Werte aus dem Wahlprotokoll der letzten BR-Wahl. Wird beim automatischen Ersatzmitglieder-Vorschlag
        in Sitzungen nur als Warnung angezeigt, nie blockierend.
      </p>
      {laden ? (
        <div className="flex items-center text-gray-400 text-sm"><Loader2 size={16} className="animate-spin mr-2" /> Laden…</div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-sm text-gray-600">Minderheitengeschlecht</label>
          <select
            value={geschlecht}
            onChange={e => setGeschlecht(e.target.value as Geschlecht | "")}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          >
            <option value="">Nicht konfiguriert</option>
            <option value="MAENNLICH">Männlich</option>
            <option value="WEIBLICH">Weiblich</option>
          </select>
          <label className="text-sm text-gray-600 ml-2">Mindestsitze</label>
          <input
            type="number" min={0} value={mindestsitze}
            onChange={e => setMindestsitze(e.target.value)}
            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          />
          <button
            onClick={speichernKlick}
            disabled={speichern}
            className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ml-2"
          >
            {speichern && <Loader2 size={14} className="animate-spin" />}
            Speichern
          </button>
          {gespeichert && <span className="text-green-700 text-sm">Gespeichert.</span>}
        </div>
      )}
      {fehler && <p className="text-red-700 text-sm mt-2">{fehler}</p>}
    </div>
  );
}

function backupAlter(zeitpunkt: string): string {
  const ms = Date.now() - new Date(zeitpunkt).getTime();
  const stunden = Math.floor(ms / (1000 * 60 * 60));
  if (stunden < 1)  return "vor wenigen Minuten";
  if (stunden < 24) return `vor ${stunden} Stunde${stunden !== 1 ? "n" : ""}`;
  const tage = Math.floor(stunden / 24);
  return `vor ${tage} Tag${tage !== 1 ? "en" : ""}`;
}

function formatGroesse(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Absender der Mails (Einladungen, Erinnerungen, Passwort-Reset) ──
function MailAbsenderEinstellung() {
  const [name, setName]         = useState("");
  const [adresse, setAdresse]   = useState("");
  const [signatur, setSignatur] = useState("");
  const [standard, setStandard] = useState("");
  const [smtpAktiv, setSmtpAktiv] = useState(true);
  const [laden, setLaden]       = useState(true);
  const [speichern, setSpeichern] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [fehler, setFehler]     = useState("");

  useEffect(() => {
    api.einstellungen.mail()
      .then(m => { setName(m.absenderName); setAdresse(m.absenderAdresse); setSignatur(m.signatur); setStandard(m.standard); setSmtpAktiv(m.smtpAktiv); })
      .catch(() => {})
      .finally(() => setLaden(false));
  }, []);

  async function speichernKlick() {
    setFehler(""); setSpeichern(true); setGespeichert(false);
    try {
      await api.einstellungen.mailSpeichern({ absenderName: name, absenderAdresse: adresse, signatur });
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 3000);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSpeichern(false);
    }
  }

  const feld = "border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h2 className="font-semibold text-gray-800 mb-1">E-Mail-Absender</h2>
      <p className="text-sm text-gray-500 mb-4">
        Von dieser Adresse gehen Einladungen, Fristen-Erinnerungen und Passwort-Links raus. Der Mailserver muss
        das SMTP-Konto für diese Adresse freigeben – das richtet die IT ein.
        {standard && <> Ohne Eintrag gilt <span className="font-mono text-xs">{standard}</span>.</>}
      </p>
      {!smtpAktiv && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Es ist kein Mailserver eingerichtet (SMTP_HOST in der .env) – es werden keine Mails verschickt.
        </p>
      )}
      {laden ? (
        <div className="flex items-center text-gray-400 text-sm"><Loader2 size={16} className="animate-spin mr-2" /> Laden…</div>
      ) : (
        <div className="flex items-start gap-2 flex-wrap">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name, z. B. Betriebsrat" className={`${feld} w-56`} />
          <input type="email" value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="betriebsrat@firma.de" className={`${feld} w-72`} />
          <textarea
            value={signatur}
            onChange={e => setSignatur(e.target.value)}
            rows={3}
            placeholder={"Signatur unter Einladungen, z. B.\nBetriebsrat Nordwerk · Werk 1, Raum 104\nTel. 0123 456-78 · betriebsrat@firma.de"}
            className={`${feld} w-full resize-y`}
          />
          <button
            onClick={speichernKlick}
            disabled={speichern}
            className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            {speichern && <Loader2 size={14} className="animate-spin" />}
            Speichern
          </button>
          {gespeichert && <span className="text-green-700 text-sm">Gespeichert.</span>}
        </div>
      )}
      {fehler && <p className="text-red-700 text-sm mt-2">{fehler}</p>}
    </div>
  );
}

function SystemTab() {
  const [info, setInfo]         = useState<{ watchFolderPfad: string; watchFolderAktiv: boolean } | null>(null);
  const [laden, setLaden]       = useState(true);
  const [meineRolle, setMeineRolle] = useState<Rolle | null>(null);
  const [backups, setBackups]   = useState<{ pfadLesbar: boolean; anzahl: number; saetze: { zeitpunkt: string; groesseBytes: number; vollstaendig: boolean }[] } | null>(null);
  const [watchLog, setWatchLog] = useState<WatchfolderLogEintrag[]>([]);

  useEffect(() => {
    api.einstellungen.system()
      .then(setInfo)
      .catch(console.error)
      .finally(() => setLaden(false));
    api.auth.me().then(b => setMeineRolle(b.rolle)).catch(() => {});
    api.einstellungen.backups().then(setBackups).catch(() => {});
    api.watchfolder.log().then(setWatchLog).catch(() => {});
  }, []);

  // wie ORDNER_KATEGORIE in backend/src/services/watchfolder.service.ts
  const UNTERORDNER = [
    "anhoerung_99", "anhoerung_102", "anhoerung_102_ausserordentlich", "abmahnung",
    "bewerbung", "bewerbung_alternativ", "zeitmodell_87", "betriebsvereinbarung",
    "arbeitgeber_info", "arbeitsschutz", "schriftverkehr", "protokoll", "sonstiges",
  ];

  return (
    <div className="space-y-4">
      {meineRolle && ["VORSITZ", "STELLVERTRETER", "ADMIN"].includes(meineRolle) && <MailAbsenderEinstellung />}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Watch-Folder</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Ordner der automatisch auf neue Dokumente überwacht wird.
          </p>
        </div>
        {laden ? (
          <div className="flex items-center justify-center h-24 text-gray-400">
            <Loader2 className="animate-spin mr-2" size={18} /> Laden…
          </div>
        ) : info && (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-2">
              {info.watchFolderAktiv
                ? <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                : <XCircle     size={16} className="text-gray-400 shrink-0" />}
              <span className="text-sm text-gray-600">
                Watch-Folder ist <span className={info.watchFolderAktiv ? "font-semibold text-green-700" : "font-semibold text-gray-500"}>
                  {info.watchFolderAktiv ? "aktiv" : "deaktiviert"}
                </span>
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Basis-Pfad (auf dem NAS)</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <FolderOpen size={15} className="text-gray-400 shrink-0" />
                <code className="text-sm text-gray-800 font-mono break-all">{info.watchFolderPfad}</code>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Unterordner nach Kategorie</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {UNTERORDNER.map(o => (
                  <div key={o} className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">
                    <FolderOpen size={12} className="text-gray-400 shrink-0" />
                    <code className="font-mono">{o}</code>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Erlaubte Dateitypen: .pdf · .docx · .docm · .xlsx — Fehlerhafte Dateien landen in <code className="font-mono">fehler/</code>
            </p>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Scan-Eingang (kein Dokument, Zuordnung im Eingang)</p>
              <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5 w-fit">
                <FolderOpen size={12} className="text-gray-400 shrink-0" />
                <code className="font-mono">protokoll_scan</code>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Für Scans der Anwesenheitsliste/Protokoll-Unterschriften (Paket 4, Stufe 4) – landen nicht als
                Dokument, sondern tauchen im Eingang als "wartender Scan" auf und werden dort per Klick einer
                Sitzung zugeordnet. Erlaubte Dateitypen: .pdf · .jpg · .jpeg · .png
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Letzte Importe</p>
              {watchLog.length === 0 ? (
                <p className="text-xs text-gray-400">Noch keine Watch-Folder-Aktivität</p>
              ) : (
                <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
                  {watchLog.slice(0, 15).map(e => {
                    const ok = e.aktion === "WATCHFOLDER_DATEI_EMPFANGEN";
                    return (
                      <li key={e.id} className="px-3 py-2 flex items-start gap-2 text-xs">
                        {ok ? <CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" />
                            : <XCircle      size={14} className="text-red-500 mt-0.5 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-gray-800 truncate">{e.details?.dateiname ?? "–"}</p>
                          {!ok && e.details?.fehler && <p className="text-red-500 truncate">{e.details.fehler}</p>}
                        </div>
                        <span className="shrink-0 text-gray-400 whitespace-nowrap">
                          {new Date(e.zeitpunkt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Backup & Restore</h2>
        <p className="text-sm text-gray-500 mb-4">
          Läuft bewusst außerhalb der App als Skript auf dem NAS — nicht über diese Oberfläche.
        </p>

        <div className="space-y-4 text-sm text-gray-600">
          <div>
            <p className="font-medium text-gray-800 mb-1">Backup erstellen</p>
            <p>
              <code className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 font-mono text-xs">./backup.sh</code> im
              Projektordner auf dem NAS ausführen. Am besten täglich automatisch über den{" "}
              <b>QNAP Task Scheduler</b> einrichten, statt es manuell zu machen.
            </p>
            <ul className="list-disc list-inside mt-1.5 space-y-0.5">
              <li>Sichert die komplette Datenbank (alle Sitzungen, Dokument-Metadaten, Beschlüsse, Aufgaben, Eingruppierung, Benutzer, Audit-Log, …)</li>
              <li>Sichert zusätzlich den <code className="font-mono">storage/</code>-Ordner mit den eigentlichen (verschlüsselten) Dokument-Dateien</li>
              <li>Behält automatisch nur die letzten 30 Tage, ältere Backups werden gelöscht</li>
            </ul>

            {backups && (
              backups.pfadLesbar ? (
                backups.anzahl > 0 ? (
                  <div className="mt-2.5 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
                    <CheckCircle2 size={14} className={backups.saetze[0].vollstaendig ? "text-green-500 shrink-0" : "text-amber-500 shrink-0"} />
                    <span>
                      <b>{backups.anzahl}</b> Backup{backups.anzahl !== 1 ? "s" : ""} im Ordner · letztes {backupAlter(backups.saetze[0].zeitpunkt)}
                      {" "}({formatGroesse(backups.saetze[0].groesseBytes)}){!backups.saetze[0].vollstaendig && " · unvollständig (DB oder Storage fehlt)"}
                    </span>
                  </div>
                ) : (
                  <div className="mt-2.5 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    <XCircle size={14} className="shrink-0" />
                    Ordner ist erreichbar, aber es liegt noch kein Backup darin.
                  </div>
                )
              ) : (
                <div className="mt-2.5 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500">
                  <XCircle size={14} className="shrink-0" />
                  Backup-Ordner im Container nicht lesbar (Mount fehlt evtl. noch nach diesem Deploy).
                </div>
              )
            )}
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="font-medium text-red-800 mb-1">Wichtig: Verschlüsselungs-Schlüssel separat sichern</p>
            <p className="text-red-700">
              Die Dokument-Dateien sind verschlüsselt gespeichert. Der Schlüssel dafür (<code className="font-mono">ENCRYPTION_KEY</code>)
              steht nur in der <code className="font-mono">.env</code>-Datei auf dem NAS — <b>nicht</b> im Backup selbst. Geht diese Zeile
              verloren, sind auch alle gesicherten Dokumente unwiderruflich unlesbar. Diese eine Zeile daher separat an einem sicheren Ort
              aufbewahren (z.B. Passwort-Manager), nicht nur auf dem NAS.
            </p>
          </div>

          <div>
            <p className="font-medium text-gray-800 mb-1">Wiederherstellen</p>
            <p>
              <code className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 font-mono text-xs">./restore.sh</code> im
              Projektordner ausführen — fragt interaktiv, welches Backup eingespielt werden soll, stoppt dafür kurz das Backend,
              spielt Datenbank (und optional den Storage-Ordner) ein und startet das Backend neu.
            </p>
            <p className="mt-1.5 text-amber-700">
              Ersetzt dabei die komplette aktuelle Datenbank — vorher sicherstellen, dass das wirklich gewollt ist.
            </p>
          </div>
        </div>
      </div>

      {meineRolle === "ADMIN" && <SicherheitEinstellung />}
      {meineRolle === "ADMIN" && <GehaltstabelleGefahrenzone />}
    </div>
  );
}

export default function Einstellungen() {
  const [tab, setTab]       = useState<Tab>("fristen");
  const [regeln, setRegeln] = useState<Aufbewahrungsregel[]>([]);
  const [laden, setLaden]   = useState(true);
  const [meineRolle, setMeineRolle] = useState<Rolle | null>(null);
  const [ohneInhalt, setOhneInhalt] = useState(false);

  useEffect(() => {
    api.einstellungen.aufbewahrung()
      .then(setRegeln)
      .catch(console.error)
      .finally(() => setLaden(false));
    api.auth.me().then(b => { setMeineRolle(b.rolle); setOhneInhalt(!!b.ohneInhaltszugriff); }).catch(() => {});
  }, []);

  function regelAktualisieren(neu: Aufbewahrungsregel) {
    setRegeln(prev => prev.map(r => r.kategorie === neu.kategorie ? neu : r));
  }

  const tabKlasse = (t: Tab) =>
    `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? "border-[rgb(var(--accent))] text-[rgb(var(--accent))]"
        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
    }`;

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={22} className="text-gray-600" />
        <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button className={tabKlasse("fristen")} onClick={() => setTab("fristen")}>
          <Clock size={15} /> Löschfristen
        </button>
        <button className={tabKlasse("protokoll")} onClick={() => setTab("protokoll")}>
          <FileText size={15} /> Protokoll-Layout
        </button>
        <button className={tabKlasse("benutzer")} onClick={() => setTab("benutzer")}>
          <Users size={15} /> Benutzerverwaltung
        </button>
        <button className={tabKlasse("design")} onClick={() => setTab("design")}>
          <Palette size={15} /> Design
        </button>
        <button className={tabKlasse("system")} onClick={() => setTab("system")}>
          <FolderOpen size={15} /> System
        </button>
        {meineRolle === "ADMIN" && (
          <button className={tabKlasse("module")} onClick={() => setTab("module")}>
            <Puzzle size={15} /> Module
          </button>
        )}
        {meineRolle === "ADMIN" && (
          <button className={tabKlasse("gesetze")} onClick={() => setTab("gesetze")}>
            <Scale size={15} /> Gesetzestexte
          </button>
        )}
        {meineRolle && ["VORSITZ", "STELLVERTRETER", "ADMIN"].includes(meineRolle) && !ohneInhalt && (
          <button className={tabKlasse("amtsuebergabe")} onClick={() => setTab("amtsuebergabe")}>
            <Download size={15} /> Amtsübergabe
          </button>
        )}
      </div>

      {/* Tab: Löschfristen */}
      {tab === "fristen" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Aufbewahrungsfristen</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Legt fest, nach wie vielen Tagen Dokumente automatisch zur Löschung vorgemerkt werden.
              Änderungen gelten nur für neu hochgeladene Dokumente.
            </p>
          </div>

          {laden ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <Loader2 className="animate-spin mr-2" size={18} /> Laden…
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Dokumentkategorie</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Frist</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Rechtsgrundlage</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {regeln.map(r => (
                  <RegelZeile key={r.kategorie} regel={r} onGespeichert={regelAktualisieren} />
                ))}
              </tbody>
            </table>
          )}

          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
            Standardwerte: Bewerbung = 3 Monate · Alt. Bewerbung = 1 Monat · Abmahnung = 3 Jahre · Protokoll = 4 Jahre · Betriebsvereinbarung = 10 Jahre · alle übrigen = 5 Jahre. Das Löschdatum einzelner Dokumente lässt sich im Bearbeiten-Dialog des Dokuments ändern.
          </div>
        </div>
      )}

      {/* Fristen-Erinnerungsmail testen (nur VORSITZ/STELLVERTRETER/ADMIN) */}
      {tab === "fristen" && !ohneInhalt && meineRolle && ["ADMIN", "VORSITZ", "STELLVERTRETER"].includes(meineRolle) && (
        <FristenErinnerungTestBox />
      )}

      {/* Zeitmodell/Überstunden-Ablaufmail testen (nur VORSITZ/STELLVERTRETER/ADMIN) */}
      {tab === "fristen" && !ohneInhalt && meineRolle && ["ADMIN", "VORSITZ", "STELLVERTRETER"].includes(meineRolle) && (
        <AblaufErinnerungTestBox />
      )}

      {/* Tab: Protokoll-Layout */}
      {tab === "protokoll" && <ProtokollTab />}

      {/* Tab: Benutzerverwaltung */}
      {tab === "benutzer" && meineRolle && ["VORSITZ", "STELLVERTRETER", "ADMIN"].includes(meineRolle) && (
        <AdminZugriffEinstellung darfAendern={meineRolle !== "ADMIN"} />
      )}
      {tab === "benutzer" && meineRolle && ["VORSITZ", "STELLVERTRETER", "ADMIN"].includes(meineRolle) && <WahlQuoteEinstellung />}
      {tab === "benutzer" && <BenutzerVerwaltung eingebettet />}

      {/* Tab: Design */}
      {tab === "design" && <DesignTab />}

      {/* Tab: System */}
      {tab === "system" && <SystemTab />}

      {/* Tab: Module (nur ADMIN) */}
      {tab === "module" && meineRolle === "ADMIN" && <ModuleTab />}

      {/* Tab: Gesetzestexte (nur ADMIN) */}
      {tab === "gesetze" && meineRolle === "ADMIN" && <GesetzeTab />}

      {/* Tab: Amtsübergabe (nur VORSITZ/STELLVERTRETER/ADMIN) */}
      {tab === "amtsuebergabe" && !ohneInhalt && meineRolle && ["VORSITZ", "STELLVERTRETER", "ADMIN"].includes(meineRolle) && <AmtsuebergabeTab />}
    </div>
  );
}

// ── Tab: Amtsübergabe (nur VORSITZ/STELLVERTRETER/ADMIN) ────────────
function AmtsuebergabeTab() {
  const [laden, setLaden] = useState(false);

  // Geschützter Endpoint (Login nötig) – ein einfacher <a href> würde den
  // Auth-Token nicht mitschicken und nur eine 401-Fehlerseite liefern.
  async function pdfOeffnen() {
    setLaden(true);
    const tab = window.open("", "_blank");
    try {
      const token = localStorage.getItem("brdms_token");
      const res = await fetch(api.export.amtsuebergabeUrl(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url; else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      if (tab) tab.close();
      alert("PDF konnte nicht erstellt werden");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start gap-3">
          <Download className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="font-semibold text-gray-800">Amtsübergabe-Export</h2>
            <p className="text-sm text-gray-500 mt-0.5 mb-3">
              Erstellt eine lesbare PDF-Übersicht — gedacht als Grundlage für ein
              Übergabegespräch, nicht als vollständiger Datenexport.
            </p>
            <button
              onClick={pdfOeffnen}
              disabled={laden}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-60 transition-colors font-medium"
            >
              {laden ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              PDF öffnen
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Im PDF enthalten</h3>
          <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
            <li>Aktive BR-Mitglieder (Name, E-Mail, Rolle)</li>
            <li>Alle aktiven Dokumente nach Kategorie — Titel, Aktenzeichen, offene Fristen, Status</li>
            <li>Beschlussregister — alle finalisierten Beschlüsse mit Sitzung/TOP, Antragstext, Ergebnis, Rechtsgrundlage</li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Bleibt im System (nicht im PDF)</h3>
          <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
            <li>Die Dokument-Dateien selbst (nur Titel/Metadaten werden gelistet)</li>
            <li>Sitzungsprotokolle im Volltext</li>
            <li>Aufgaben, Zeiträume, Themen-Backlog</li>
            <li>Eingruppierung, Schulungsverwaltung/Qualifikationsmatrix</li>
            <li>Betriebsvereinbarungs-Register, Wissensarchiv, Ressourcen</li>
            <li>Audit-Log, Kommentare, Kummerkasten-Einträge</li>
            <li>Benutzerkonten selbst (keine Zugangsdaten im Export)</li>
          </ul>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-semibold text-gray-800 text-sm mb-3">So übergebt ihr das System an einen neuen Kopf</h3>
        <ol className="text-sm text-gray-600 space-y-2.5 list-decimal list-inside">
          <li>Neue/n Vorsitzende/n bzw. Stellvertretung unter <b>Benutzerverwaltung</b> mit passender Rolle anlegen.</li>
          <li>Dieses PDF exportieren und im Übergabegespräch gemeinsam durchgehen.</li>
          <li>Alte, ausscheidende Zugänge in der <b>Benutzerverwaltung</b> <em>deaktivieren</em> (nicht löschen) — die Historie (wer hat was erstellt/entschieden) bleibt so nachvollziehbar. Löschen ist nur für nie genutzte Test-Accounts gedacht.</li>
          <li>
            Die eigentliche System-Administration (NAS-Zugang, Docker, Datenbank-Zugangsdaten) läuft
            komplett <em>außerhalb</em> dieser App und wird hier nicht exportiert — das muss separat
            und sicher weitergegeben werden (z.B. Passwort-Manager statt E-Mail/Chat).
          </li>
          <li>Für eine vollständige technische Sicherung inkl. aller Dateien und Datenbank-Inhalte: Datenbank-Backup erstellen (siehe Backup/Restore).</li>
        </ol>
      </div>
    </div>
  );
}

// ── Tab: Module (nur ADMIN) ─────────────────────────────────────────
function ModuleTab() {
  const [module, setModule] = useState<Record<ModuleKey, boolean> | null>(null);
  const [laden, setLaden]   = useState(true);
  const [speichertKey, setSpeichertKey] = useState<ModuleKey | null>(null);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    api.einstellungen.module()
      .then(setModule)
      .catch(() => setFehler("Konnte Modul-Status nicht laden"))
      .finally(() => setLaden(false));
  }, []);

  async function umschalten(key: ModuleKey) {
    if (!module) return;
    const neuerWert = !module[key];
    setSpeichertKey(key);
    setFehler("");
    try {
      await api.einstellungen.moduleSpeichern({ [key]: neuerWert });
      setModule(prev => prev ? { ...prev, [key]: neuerWert } : prev);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSpeichertKey(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Module</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Optionale Module ein-/ausblenden — praktisch bei Installationen für andere Betriebsräte,
          die nicht alle Funktionen brauchen. Deaktivierte Module verschwinden aus der Seitenleiste.
        </p>
      </div>

      {laden ? (
        <div className="flex items-center justify-center h-32 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={18} /> Laden…
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {MODULE_KEYS.map(key => {
            const aktiv = module?.[key] ?? true;
            return (
              <div key={key} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">{MODULE_LABEL[key].name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{MODULE_LABEL[key].beschreibung}</p>
                </div>
                <button
                  onClick={() => umschalten(key)}
                  disabled={speichertKey === key}
                  role="switch"
                  aria-checked={aktiv}
                  title={aktiv ? "Aktiv – klicken zum Deaktivieren" : "Deaktiviert – klicken zum Aktivieren"}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                    aktiv ? "bg-[rgb(var(--accent))]" : "bg-gray-300"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${aktiv ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {fehler && (
        <div className="px-6 py-3 bg-red-50 border-t border-red-100 text-red-700 text-sm">{fehler}</div>
      )}
    </div>
  );
}

// ── Fristen-Erinnerungsmail testen ───────────────────────────────────
// Läuft normalerweise täglich 07:00 Uhr automatisch (nur an VORSITZ/STELLVERTRETER,
// nur wenn Fristen in den nächsten 7 Tagen fällig sind) – zum Nachprüfen, ob das
// wirklich funktioniert, hier direkt auslösbar statt bis morgen früh zu warten.
function FristenErinnerungTestBox() {
  const [laeuft, setLaeuft]     = useState(false);
  const [ergebnis, setErgebnis] = useState<Awaited<ReturnType<typeof api.fristen.erinnerungTesten>> | null>(null);
  const [fehler, setFehler]     = useState("");
  const [aktiv, setAktiv]       = useState<boolean | null>(null);
  const [umschaltet, setUmschaltet] = useState(false);

  useEffect(() => {
    api.einstellungen.fristenErinnerung().then(r => setAktiv(r.aktiv)).catch(() => {});
  }, []);

  async function umschalten() {
    if (aktiv === null) return;
    setUmschaltet(true);
    try {
      const r = await api.einstellungen.fristenErinnerungSpeichern(!aktiv);
      setAktiv(r.ok ? !aktiv : aktiv);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Umschalten");
    } finally {
      setUmschaltet(false);
    }
  }

  async function testen() {
    setLaeuft(true);
    setFehler("");
    setErgebnis(null);
    try {
      setErgebnis(await api.fristen.erinnerungTesten());
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Testen");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-800">Fristen-Erinnerungsmail</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Läuft automatisch täglich um 07:00 Uhr – schickt eine Zusammenfassung an VORSITZ/STELLVERTRETER,
            aber nur wenn in den nächsten 7 Tagen tatsächlich Fristen fällig werden. Hier direkt testen,
            statt bis morgen zu warten.
          </p>
        </div>
        <button
          onClick={testen}
          disabled={laeuft}
          className="flex items-center gap-1.5 shrink-0 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          {laeuft ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Jetzt testen
        </button>
      </div>

      <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-4 bg-gray-50">
        <div>
          <p className="text-sm font-medium text-gray-800">Automatischer Versand (täglich 07:00 Uhr)</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Zum Pausieren ausschalten – „Jetzt testen" oben funktioniert unabhängig davon immer.
          </p>
        </div>
        <button
          onClick={umschalten}
          disabled={aktiv === null || umschaltet}
          role="switch"
          aria-checked={aktiv ?? false}
          title={aktiv ? "Aktiv – klicken zum Pausieren" : "Pausiert – klicken zum Aktivieren"}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            aktiv ? "bg-[rgb(var(--accent))]" : "bg-gray-300"
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${aktiv ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      {ergebnis && (
        <div className="px-6 py-4 text-sm space-y-1">
          <p className="text-gray-700">
            {ergebnis.fristenAnzahl === 0
              ? "Keine Fristen in den nächsten 7 Tagen fällig – deshalb wurde nichts verschickt (kein Fehler)."
              : ergebnis.empfaengerAnzahl === 0
              ? `${ergebnis.fristenAnzahl} fällige Frist(en) gefunden, aber keine aktiven Benutzer mit Rolle VORSITZ/STELLVERTRETER.`
              : `${ergebnis.fristenAnzahl} fällige Frist(en) · ${ergebnis.gesendetAn.length}/${ergebnis.empfaengerAnzahl} Mail(s) erfolgreich versendet.`}
          </p>
          {ergebnis.gesendetAn.length > 0 && (
            <p className="text-green-700 text-xs">✓ Gesendet an: {ergebnis.gesendetAn.join(", ")}</p>
          )}
          {ergebnis.fehlgeschlagenAn.length > 0 && (
            <div className="text-red-700 text-xs">
              {ergebnis.fehlgeschlagenAn.map(f => (
                <p key={f.email}>✗ {f.email}: {f.fehler}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {fehler && (
        <div className="px-6 py-3 bg-red-50 border-t border-red-100 text-red-700 text-sm">{fehler}</div>
      )}
    </div>
  );
}

// ── Zeitmodell/Überstunden-Ablaufmail testen ─────────────────────────
// Läuft normalerweise monatlich am 15. um 07:00 Uhr automatisch (nur an
// VORSITZ/STELLVERTRETER, nur wenn im laufenden Kalendermonat Zeitmodell- oder
// Überstunden-Zeiträume auslaufen) – zum Nachprüfen hier direkt auslösbar statt
// bis zum nächsten 15. zu warten.
function AblaufErinnerungTestBox() {
  const [laeuft, setLaeuft]     = useState(false);
  const [ergebnis, setErgebnis] = useState<Awaited<ReturnType<typeof api.ablauf.testen>> | null>(null);
  const [fehler, setFehler]     = useState("");

  async function testen() {
    setLaeuft(true);
    setFehler("");
    setErgebnis(null);
    try {
      setErgebnis(await api.ablauf.testen());
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Testen");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-800">Zeitmodell/Überstunden-Ablaufmail</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Läuft automatisch monatlich am 15. um 07:00 Uhr – schickt eine Zusammenfassung an VORSITZ/STELLVERTRETER,
            aber nur wenn im laufenden Monat (1. bis letzter Tag) tatsächlich Zeitmodell- oder Überstunden-Zeiträume
            auslaufen. Hier direkt testen, statt bis zum nächsten 15. zu warten.
          </p>
        </div>
        <button
          onClick={testen}
          disabled={laeuft}
          className="flex items-center gap-1.5 shrink-0 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          {laeuft ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Jetzt testen
        </button>
      </div>

      {ergebnis && (
        <div className="px-6 py-4 text-sm space-y-1">
          <p className="text-gray-700">
            {ergebnis.eintraegeAnzahl === 0
              ? "Keine Zeitmodell-/Überstunden-Zeiträume laufen diesen Monat aus – deshalb wurde nichts verschickt (kein Fehler)."
              : ergebnis.empfaengerAnzahl === 0
              ? `${ergebnis.eintraegeAnzahl} auslaufende(r) Zeitraum/Zeiträume gefunden, aber keine aktiven Benutzer mit Rolle VORSITZ/STELLVERTRETER.`
              : `${ergebnis.eintraegeAnzahl} auslaufende(r) Zeitraum/Zeiträume · ${ergebnis.gesendetAn.length}/${ergebnis.empfaengerAnzahl} Mail(s) erfolgreich versendet.`}
          </p>
          {ergebnis.gesendetAn.length > 0 && (
            <p className="text-green-700 text-xs">✓ Gesendet an: {ergebnis.gesendetAn.join(", ")}</p>
          )}
          {ergebnis.fehlgeschlagenAn.length > 0 && (
            <div className="text-red-700 text-xs">
              {ergebnis.fehlgeschlagenAn.map(f => (
                <p key={f.email}>✗ {f.email}: {f.fehler}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {fehler && (
        <div className="px-6 py-3 bg-red-50 border-t border-red-100 text-red-700 text-sm">{fehler}</div>
      )}
    </div>
  );
}

// ── Tab: Gesetzestexte (nur ADMIN) ───────────────────────────────────
function GesetzeTab() {
  const [status, setStatus]   = useState<GesetzStatus[] | null>(null);
  const [laden, setLaden]     = useState(true);
  const [aktualisiert, setAktualisiert] = useState(false);
  const [letzteAenderungen, setLetzteAenderungen] = useState<Record<string, { neu: string[]; geaendert: string[]; istErstimport: boolean }>>({});
  const [fehlerZeilen, setFehlerZeilen] = useState<Record<string, string>>({});
  const [fehler, setFehler]   = useState("");

  const [workerLaeuft, setWorkerLaeuft] = useState(false);
  const [workerErgebnis, setWorkerErgebnis] = useState<Awaited<ReturnType<typeof api.gesetze.workerTesten>> | null>(null);

  useEffect(() => { laden_(); }, []);

  async function laden_() {
    setLaden(true);
    try {
      setStatus(await api.gesetze.status());
    } catch {
      setFehler("Konnte Status nicht laden");
    } finally {
      setLaden(false);
    }
  }

  async function jetztAktualisieren() {
    setAktualisiert(true);
    setFehler("");
    setFehlerZeilen({});
    try {
      const { ergebnisse } = await api.gesetze.aktualisieren();
      const zeilenFehler: Record<string, string> = {};
      const aenderungen: Record<string, { neu: string[]; geaendert: string[]; istErstimport: boolean }> = {};
      for (const e of ergebnisse) {
        if (e.fehler) zeilenFehler[e.slug] = e.fehler;
        aenderungen[e.slug] = { neu: e.neu, geaendert: e.geaendert, istErstimport: e.istErstimport };
      }
      setFehlerZeilen(zeilenFehler);
      setLetzteAenderungen(aenderungen);
      await laden_();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Aktualisieren");
    } finally {
      setAktualisiert(false);
    }
  }

  async function workerTesten() {
    setWorkerLaeuft(true);
    setFehler("");
    setWorkerErgebnis(null);
    try {
      const ergebnis = await api.gesetze.workerTesten();
      setWorkerErgebnis(ergebnis);
      await laden_();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Testen");
    } finally {
      setWorkerLaeuft(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-800">Gesetzestexte</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Statischer Import von gesetze-im-internet.de – macht die Paragraphen offline
              und volltextdurchsuchbar (über die Suche oben in der Seitenleiste).
              Läuft automatisch monatlich am 1. um 03:00 Uhr, hier auch manuell auslösbar.
            </p>
          </div>
          <button
            onClick={jetztAktualisieren}
            disabled={aktualisiert}
            className="flex items-center gap-1.5 shrink-0 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            {aktualisiert ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Jetzt aktualisieren
          </button>
        </div>

        {laden ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            <Loader2 className="animate-spin mr-2" size={18} /> Laden…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-3 font-medium">Gesetz</th>
                <th className="px-4 py-3 font-medium">Paragraphen</th>
                <th className="px-4 py-3 font-medium">Stand</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {status?.map(s => {
                const aenderung = letzteAenderungen[s.slug];
                return (
                  <tr key={s.slug}>
                    <td className="px-6 py-3 font-medium text-gray-800">{s.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.anzahl > 0 ? s.anzahl : <span className="text-gray-400">noch nicht importiert</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {s.aktualisiertAm
                        ? new Date(s.aktualisiertAm).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "–"}
                      {fehlerZeilen[s.slug] && (
                        <span className="block text-red-600 text-xs mt-0.5">Fehler: {fehlerZeilen[s.slug]}</span>
                      )}
                      {aenderung && !aenderung.istErstimport && aenderung.geaendert.length > 0 && (
                        <span className="block text-amber-700 text-xs mt-0.5">Geändert: {aenderung.geaendert.join(", ")}</span>
                      )}
                      {aenderung && !aenderung.istErstimport && aenderung.neu.length > 0 && (
                        <span className="block text-green-700 text-xs mt-0.5">Neu: {aenderung.neu.join(", ")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {fehler && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-100 text-red-700 text-sm">{fehler}</div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-800">Automatischen Ablauf testen</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Führt genau das aus, was auch nachts um 3 Uhr automatisch passiert – inklusive
              Nachricht an VORSITZ/STELLVERTRETER, falls sich an einem bereits bekannten
              Paragraphen wirklich etwas geändert hat (der allererste Import zählt nicht als Änderung).
            </p>
          </div>
          <button
            onClick={workerTesten}
            disabled={workerLaeuft}
            className="flex items-center gap-1.5 shrink-0 border border-[rgb(var(--accent))] text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))] hover:text-white disabled:opacity-60 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            {workerLaeuft ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Jetzt testen
          </button>
        </div>

        {workerErgebnis && (
          <div className="px-6 py-4 text-sm space-y-1">
            {workerErgebnis.relevanteAenderungen.length === 0 ? (
              <p className="text-gray-700">Keine relevanten Änderungen gefunden – deshalb wurde keine Nachricht verschickt.</p>
            ) : (
              <>
                <p className="text-gray-700">
                  Änderungen gefunden, {workerErgebnis.benachrichtigt.length} Benutzer benachrichtigt:
                </p>
                {workerErgebnis.relevanteAenderungen.map(a => (
                  <p key={a.gesetz} className="text-amber-700 text-xs">{a.gesetz}: {a.paragraphen.join(", ")}</p>
                ))}
                {workerErgebnis.benachrichtigt.length > 0 && (
                  <p className="text-green-700 text-xs">✓ Nachricht an: {workerErgebnis.benachrichtigt.join(", ")}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
