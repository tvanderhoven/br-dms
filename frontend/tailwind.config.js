/** @type {import('tailwindcss').Config} */
import colors from "tailwindcss/colors";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Neutrales Grau ohne Blaustich (clean "Board"-Look) – ersetzt Tailwinds gray überall zentral
        gray: colors.zinc,
        // Akzentfarbe aus Einstellungen → Design, mit Deckkraft-Stufen (z.B. bg-accent/5)
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-hover": "rgb(var(--accent-hover) / <alpha-value>)",
        // Markenrot aus dem Logo – sparsam einsetzen (aktive Navigation, Logo-Akzente)
        "brand-red": "rgb(var(--brand-red) / <alpha-value>)",
        brand: {
          50:  "rgb(var(--brand-50) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
        },
        surface: {
          sidebar: "rgb(var(--sidebar-bg) / <alpha-value>)",
          accent:  "rgb(var(--accent) / <alpha-value>)",
        },
      },
      boxShadow: {
        // Weicher, tiefer Karten-Schatten statt harter Kante
        sm: "0 1px 2px rgb(0 0 0 / 0.04), 0 12px 24px -20px rgb(0 0 0 / 0.30)",
        DEFAULT: "0 1px 2px rgb(0 0 0 / 0.05), 0 14px 28px -20px rgb(0 0 0 / 0.35)",
      },
    },
  },
  plugins: [],
};
