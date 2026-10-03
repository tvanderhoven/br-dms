import { useEffect } from "react";
import { api, DesignEinstellungen } from "./api";

function hexToRgb(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  return `${(v >> 16) & 0xff} ${(v >> 8) & 0xff} ${v & 0xff}`;
}

function lightenDarken(r: number, g: number, b: number, amount: number): string {
  return `${Math.min(255, Math.max(0, r + amount))} ${Math.min(255, Math.max(0, g + amount))} ${Math.min(255, Math.max(0, b + amount))}`;
}

function applyDesign(design: DesignEinstellungen) {
  const root = document.documentElement;

  root.style.setProperty("--sidebar-bg", hexToRgb(design.sidebar_farbe));
  root.style.setProperty("--accent", hexToRgb(design.akzent_farbe));
  root.style.setProperty("--text-primary", hexToRgb(design.text_farbe));
  root.style.setProperty("--bg-primary", hexToRgb(design.hintergrund));

  // Derive sidebar colors
  const sr = parseInt(design.sidebar_farbe.slice(1, 3), 16);
  const sg = parseInt(design.sidebar_farbe.slice(3, 5), 16);
  const sb = parseInt(design.sidebar_farbe.slice(5, 7), 16);
  root.style.setProperty("--sidebar-active", lightenDarken(sr, sg, sb, -15));
  root.style.setProperty("--sidebar-hover", lightenDarken(sr, sg, sb, 15));
  const brightness = (sr * 0.299 + sg * 0.587 + sb * 0.114);
  if (brightness > 128) {
    root.style.setProperty("--sidebar-text", "0 0 0");
    root.style.setProperty("--sidebar-text-muted", hexToRgb("#4b5563"));
  } else {
    root.style.setProperty("--sidebar-text", "255 255 255");
    root.style.setProperty("--sidebar-text-muted", lightenDarken(255, 255, 255, -70));
  }

  // Derive accent hover
  const ar = parseInt(design.akzent_farbe.slice(1, 3), 16);
  const ag = parseInt(design.akzent_farbe.slice(3, 5), 16);
  const ab = parseInt(design.akzent_farbe.slice(5, 7), 16);
  root.style.setProperty("--accent-hover", lightenDarken(ar, ag, ab, -20));

  root.style.fontSize = `${design.schrift_groesse}px`;

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const useDark = design.dark_mode === "dark" || (design.dark_mode === "auto" && prefersDark);
  root.classList.toggle("dark", useDark);

  // Dunkler Akzent (z.B. Theme "Board") wäre im Dark Mode unsichtbar → dort die
  // hellen Dark-Mode-Werte aus index.css verwenden statt der gespeicherten Farben.
  if (useDark && (ar * 0.299 + ag * 0.587 + ab * 0.114) < 80) {
    ["--accent", "--accent-hover", "--text-primary", "--bg-primary"].forEach(v => root.style.removeProperty(v));
  }
}

export function useDesign() {
  useEffect(() => {
    api.einstellungen.design()
      .then(applyDesign)
      .catch(() => {});
  }, []);
}
