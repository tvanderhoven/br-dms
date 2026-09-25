-- Migration: AuditAktion – neuer Wert für das Löschen nur der Gehaltsstufen-Einträge (Mitarbeiter/Abteilungen bleiben erhalten)

ALTER TYPE "AuditAktion" ADD VALUE 'GEHALTSTABELLE_EINTRAEGE_GELOESCHT';
