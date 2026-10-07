# Migraciones pendientes

Migraciones escritas pero que NO deben estar en `supabase/migrations` aún,
porque rompen el código que sigue en producción. La BD es compartida y se
actualiza antes que Vercel, así que un cambio destructivo (borrar una
columna) solo se aplica cuando el código nuevo ya está desplegado.

| Archivo | Qué hace | Cuándo aplicarla |
| --- | --- | --- |
| `0085_sst_quitar_codigo_actividad.sql` | Repite el backfill `sst_perfil.codigo_actividad` → `clinicas.codigo_actividad_economica` (solo donde la clínica está en null) y borra la columna vieja. | Después de desplegar el código que lee la actividad económica desde Parámetros (migración 0080). |

Cómo aplicarla: copiarla a `supabase/migrations/` con el siguiente número
libre, correr `scripts/habilitacion/bd-local/probar.sh` y luego
`supabase db push --linked`.

Nota: el hueco en el número 0081 de `supabase/migrations` es intencional:
ahí estaba originalmente este `drop column`, que se sacó para no romper el
despliegue. Supabase no exige numeración contigua.
