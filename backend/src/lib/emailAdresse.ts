/**
 * Prüft, ob ein Text wie eine E-Mail-Adresse aussieht (lokaler Teil @ Domain mit Punkt).
 *
 * Bewusst ohne mehrdeutige Teilausdrücke: Ein Muster wie [^\s@]+\.[^\s@]+ erlaubt Punkte
 * auf beiden Seiten und probiert bei langen, präparierten Eingaben quadratisch viele
 * Varianten durch (ReDoS). Hier bestehen die Domain-Teile aus Zeichen ohne Punkt, und
 * die Länge ist auf das Maximum für Adressen (254 Zeichen, RFC 5321) begrenzt.
 */
const MUSTER = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export function istEmailAdresse(wert: string): boolean {
  return wert.length <= 254 && MUSTER.test(wert);
}
