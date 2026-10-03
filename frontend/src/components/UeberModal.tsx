import { X, Info, Mail, Scale } from "lucide-react";
import pkg from "../../package.json";

export const SUPPORT_EMAIL = "support@vanderhoven.eu";

// ── "Über BR-DMS": Version, Autor, Lizenz, Kontakt ──────────────────
export default function UeberModal({ onSchliessen }: { onSchliessen: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onSchliessen}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
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
            <p>Dokumentenmanagement für Betriebsräte · Version {pkg.version}</p>
          </div>

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
