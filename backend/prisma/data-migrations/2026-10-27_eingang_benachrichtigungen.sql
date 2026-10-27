-- Eingangsmeldungen laufen jetzt über das Benachrichtigungssystem (je Person unter
-- "Mein Konto"). Waren die alten globalen Schalter ausgeschaltet, bekommen Vorsitz und
-- Stellvertretung die neue Art auf "AUS" – sonst kämen die Mails plötzlich wieder.
-- Danach werden die alten Einstellungen entfernt.
--
-- Idempotent: läuft bei jedem Start; ohne die alten Einstellungen tut es nichts.
DO $$
BEGIN
  IF to_regclass('public.system_einstellungen') IS NOT NULL AND to_regclass('public.benutzer') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'benutzer' AND column_name = 'benachrichtigungen') THEN
    IF EXISTS (SELECT 1 FROM system_einstellungen WHERE schluessel = 'eingang.sofortmail_aktiv' AND wert = 'false') THEN
      UPDATE benutzer SET benachrichtigungen = COALESCE(benachrichtigungen, '{}'::jsonb) || '{"FRIST_EINGANG":"AUS"}'::jsonb
       WHERE rolle IN ('VORSITZ', 'STELLVERTRETER');
    END IF;
    IF EXISTS (SELECT 1 FROM system_einstellungen WHERE schluessel = 'eingang.sammelmail_aktiv' AND wert = 'false') THEN
      UPDATE benutzer SET benachrichtigungen = COALESCE(benachrichtigungen, '{}'::jsonb) || '{"EINGANG":"AUS"}'::jsonb
       WHERE rolle IN ('VORSITZ', 'STELLVERTRETER');
    END IF;
    DELETE FROM system_einstellungen
     WHERE schluessel IN ('eingang.sofortmail_aktiv', 'eingang.sammelmail_aktiv', 'eingang.sammelmail_stand');
  END IF;
END $$;
