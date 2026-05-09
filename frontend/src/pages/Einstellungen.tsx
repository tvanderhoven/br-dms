import { useEffect, useRef, useState } from "react";
import { Settings, Save, Loader2, RotateCcw, Users, Clock, FileText, Upload, Trash2, Palette, Download } from "lucide-react";
import { api, Aufbewahrungsregel, ProtokollEinstellungen, KATEGORIE_LABEL, DesignEinstellungen } from "../lib/api";
import BenutzerVerwaltung from "./Benutzer";

type Tab = "fristen" | "benutzer" | "protokoll" | "design";

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
          <p className="text-sm font-medium text-gray-900">{KATEGORIE_LABEL[regel.kategorie as keyof typeof KATEGORIE_LABEL]}</p>
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
          {KATEGORIE_LABEL[regel.kategorie as keyof typeof KATEGORIE_LABEL]}
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
                einstellungen.kopfzeile_layout === wert ? "text-blue-700" : "text-gray-500"
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
                einstellungen.fusszeile_layout === wert ? "text-blue-700" : "text-gray-500"
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
    sidebar_farbe: "#1e3a5f", akzent_farbe: "#2563eb",
    text_farbe: "#111827", hintergrund: "#f9fafb",
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

export default function Einstellungen() {
  const [tab, setTab]       = useState<Tab>("fristen");
  const [regeln, setRegeln] = useState<Aufbewahrungsregel[]>([]);
  const [laden, setLaden]   = useState(true);

  useEffect(() => {
    api.einstellungen.aufbewahrung()
      .then(setRegeln)
      .catch(console.error)
      .finally(() => setLaden(false));
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
    <div className="p-6 max-w-5xl">
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
            Standardwerte: § 99/102 = 5 Jahre · Alternative Bewerbung = 6 Monate · Protokoll = 4 Jahre · Betriebsvereinbarung = 10 Jahre · Sonstiges = 5 Jahre
          </div>
        </div>
      )}

      {/* Tab: Protokoll-Layout */}
      {tab === "protokoll" && <ProtokollTab />}

      {/* Tab: Benutzerverwaltung */}
      {tab === "benutzer" && <BenutzerVerwaltung eingebettet />}

      {/* Tab: Design */}
      {tab === "design" && <DesignTab />}

      {/* Amtsübergabe-Export */}
      <div className="mt-6 p-5 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex items-start gap-3">
          <Download className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-amber-900 text-sm">Amtsübergabe-Export</h3>
            <p className="text-xs text-amber-700 mt-0.5 mb-3">
              Erstellt eine vollständige PDF-Dokumentation aller aktiven Dokumente,
              Fristen und finalisierten Beschlüsse — für die Übergabe an einen neuen Betriebsrat.
            </p>
            <a
              href={api.export.amtsuebergabeUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              PDF herunterladen
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
