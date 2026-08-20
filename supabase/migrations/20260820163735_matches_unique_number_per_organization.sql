-- unique_number is tenant-scoped: Harelbeke and Kuurne may both use REG-001 / VR-1 / 1/8-1.

DROP INDEX IF EXISTS public.matches_unique_number_unique;

CREATE UNIQUE INDEX IF NOT EXISTS matches_organization_id_unique_number_key
  ON public.matches (organization_id, unique_number);

COMMENT ON INDEX public.matches_organization_id_unique_number_key IS
  'Wedstrijdnummer uniek binnen één tenant; platform-brede matches_unique_number_unique is verwijderd.';
