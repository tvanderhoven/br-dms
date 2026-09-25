import { Loader2, X, Globe } from "lucide-react";
import { GesetzParagraph } from "../lib/api";

export default function GesetzModal({
  paragraph,
  laden,
  onSchliessen,
}: {
  paragraph: GesetzParagraph | null;
  laden: boolean;
  onSchliessen: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onSchliessen}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        {laden || !paragraph ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            <Loader2 className="animate-spin mr-2" size={18} /> Laden…
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4 gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {paragraph.gesetz} {paragraph.paragraph}
                </h2>
                {paragraph.titel && (
                  <p className="text-sm text-gray-500 mt-0.5">{paragraph.titel}</p>
                )}
              </div>
              <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X size={20} />
              </button>
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {paragraph.text}
            </div>
            <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span>Stand: {new Date(paragraph.aktualisiertAm).toLocaleDateString("de-DE")}</span>
              <a
                href={paragraph.quelleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                Quelle: gesetze-im-internet.de <Globe size={11} />
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
