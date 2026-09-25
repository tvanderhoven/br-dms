-- Migration: AuditAktion – neuer Wert für kompletten Löschvorgang der Gehaltstabelle

ALTER TYPE "AuditAktion" ADD VALUE 'GEHALTSTABELLE_GELOESCHT';
