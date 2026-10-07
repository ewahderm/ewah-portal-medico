# Borradores de migración en curso (NO aplicar desde aquí)

Borradores de F7 (documentos y trámite) y F8 (obligaciones), interrumpidos
por límite de uso el 2026-10-06. Ninguno está aplicado en la BD. Cada fase
mueve su archivo a `supabase/migrations/` solo cuando está completo y
probado (`scripts/habilitacion/bd-local/probar.sh`).

- F5 salió como `0066_habilitacion_autoevaluacion.sql` y F6 como
  `0067_habilitacion_evidencia_modulos.sql` (2026-10-07). Por eso los
  borradores se renumeraron: F7 = `0068_habilitacion_documentos.sql`
  (termina a mitad de las políticas de storage: incompleto) y F8 =
  `0069_habilitacion_obligaciones.sql`. Ojo: el borrador de F7 crea el
  bucket `habilitacion`, que ya existe desde 0061.
