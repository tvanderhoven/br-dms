/**
 * TOP Mention Picker – Popup zur Auswahl eines TOPs
 */
import { useState, useEffect, useRef } from "react";
import { TOP } from "../lib/api";

interface Props {
  tops: TOP[];
  onSelect: (topId: string, topNummer: number) => void;
  onClose: () => void;
}

export default function TOPMentionPicker({ tops, onSelect, onClose }: Props) {
  const [suche, setSuche] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const gefiltert = tops.filter(
    (t) =>
      suche === "" ||
      t.titel.toLowerCase().includes(suche.toLowerCase()) ||
      t.nummer.toString().includes(suche)
  );

  return (
    <div className="absolute z-50 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
      <div className="p-2 border-b border-gray-100">
        <input
          ref={inputRef}
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="TOP suchen..."
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {gefiltert.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-400">Keine TOPs gefunden</p>
        ) : (
          gefiltert.map((top) => (
            <button
              key={top.id}
              onClick={() => onSelect(top.id, top.nummer)}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
            >
              <span className="text-xs font-bold text-gray-400 w-6">TOP {top.nummer}</span>
              <span className="text-sm text-gray-700 truncate">{top.titel}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
