# Borradores de migración en curso (NO aplicar desde aquí)

Borradores de F7 (0067 documentos) y F8 (0068 obligaciones), interrumpidos
por límite de uso el 2026-10-06. Ninguno está aplicado en la BD. Cada fase
mueve su archivo a `supabase/migrations/` solo cuando está completo y
probado (`scripts/habilitacion/bd-local/probar.sh`).

- `0066_habilitacion_autoevaluacion.sql` (F5) ya salió de aquí el
  2026-10-07: revisado completo y probado contra la BD local
  (`bd-local/f5-pruebas.sql`).
- `0067.sql` termina a mitad de las políticas de storage: incompleto.
