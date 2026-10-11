import { useState } from "react";
import { X, Info, Mail, Scale, Bug, ExternalLink } from "lucide-react";
import pkg from "../../package.json";

export const SUPPORT_EMAIL = "support@vanderhoven.eu";
const ISSUE_URL = "https://github.com/tvanderhoven/br-dms/issues/new";

/** "1.2.0 · be127dc" – der Commit zeigt, auf welchen Stand sich eine Meldung bezieht */
export const VERSION_ANZEIGE = __BUILD_COMMIT__ ? `${pkg.version} · ${__BUILD_COMMIT__}` : pkg.version;

/** Fehlermeldung samt Version, Seite und Browser – IDs in der Adresse werden entfernt */
function meldungsText(beschreibung: string) {
  const seite = window.location.pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
  return `${beschreibung.trim()}\n\n---\nVersion: ${VERSION_ANZEIGE}\nSeite: ${seite}\nBrowser: ${navigator.userAgent}`;
}

// ── Fehler melden: öffnet ein vorausgefülltes GitHub-Issue (oder eine E-Mail) ──
// Kein Token auf dem Server nötig; die Meldung wird erst auf GitHub abgeschickt,
// dort sieht man sie vorher noch einmal und landet danach direkt auf dem Issue.
function FehlerMelden() {
  const [titel, setTitel]               = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const vollstaendig = titel.trim().length > 0 && beschreibung.trim().length > 0;

  function aufGithub() {
    const q = new URLSearchParams({ title: titel.trim(), body: meldungsText(beschreibung), labels: "bug" });
    window.open(`${ISSUE_URL}?${q}`, "_blank", "noopener,noreferrer");
  }
  function perEmail() {
    const q = `subject=${encodeURIComponent(`BR-DMS Fehler: ${titel.trim()}`)}&body=${encodeURIComponent(meldungsText(beschreibung))}`;
    window.location.href = `mailto:${SUPPORT_EMAIL}?${q}`;
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Fehler melden</p>
      <div className="space-y-2">
        <input value={titel} onChange={e => setTitel(e.target.value)} maxLength={120}
          placeholder="Kurz: Was funktioniert nicht?"
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]/30" />
        <textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} maxLength={4000} rows={4}
          placeholder="Was haben Sie gemacht, was ist passiert, was hätten Sie erwartet?"
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 resize-y focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]/30" />
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          GitHub-Issues sind öffentlich. Bitte keine Namen, Personaldaten oder Inhalte aus Dokumenten eintragen.
          Version, Seite und Browser werden automatisch angehängt.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={aufGithub} disabled={!vollstaendig}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-[rgb(var(--accent))] hover:opacity-90 disabled:opacity-40">
            <Bug size={14} /> Auf GitHub melden <ExternalLink size={12} />
          </button>
          <button onClick={perEmail} disabled={!vollstaendig}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            <Mail size={14} /> Per E-Mail
          </button>
        </div>
        <p className="text-xs text-gray-400">Für GitHub ist ein (kostenloses) GitHub-Konto nötig – sonst per E-Mail.</p>
      </div>
    </div>
  );
}

// ── "Über BR-DMS": Version, Autor, Lizenz, Kontakt ──────────────────
export default function UeberModal({ onSchliessen }: { onSchliessen: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onSchliessen}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Info size={17} className="text-[rgb(var(--accent))]" />
            Über BR-DMS
          </h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5 text-sm text-gray-600">
          <div>
            <p className="text-lg font-extrabold tracking-tight text-gray-900">BR-DMS</p>
            <p>Dokumentenmanagement für Betriebsräte · Version {VERSION_ANZEIGE}</p>
          </div>

          <FehlerMelden />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Entwicklung</p>
            <p className="text-gray-900 font-medium">Tim van der Hoven</p>
            <p>Programmierung mit Unterstützung von Claude (Anthropic)</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Kontakt</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <Mail size={14} /> {SUPPORT_EMAIL}
            </a>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Lizenz</p>
            <p className="flex items-start gap-1.5">
              <Scale size={14} className="mt-0.5 shrink-0" />
              <span>
                Copyright © 2026 Tim van der Hoven. Open Source unter der{" "}
                <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  GNU AGPL v3.0
                </a>
                . Weitergabe und Änderung erlaubt, Urheberhinweis muss erhalten bleiben.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
