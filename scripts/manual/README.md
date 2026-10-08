# Manual de usuario

El módulo **Manual** (`/manual`) muestra guías paso a paso con capturas del portal.

- Contenido: `apps/web/lib/manual/guias/*.ts` (guías → secciones → bloques de texto, pasos, listas, notas e imágenes). El orden de lectura está en `guias/index.ts`.
- Capturas: `apps/web/public/manual/*.jpg` (1280 × 800). La prueba `lib/manual/__tests__/manual.test.ts` falla si una guía cita una captura que no existe.

## Regenerar las capturas (cuando cambie la interfaz)

Contra el Supabase **local** (nunca la BD enlazada), desde la raíz del repo:

```bash
scripts/habilitacion/supabase-local/levantar.sh          # BD local desde cero
SIN_LEVANTAR=1 scripts/finanzas/regresion.sh             # datos del flujo de caja
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f scripts/manual/semilla.sql
scripts/manual/capturas.sh                               # escribe apps/web/public/manual
RECORRIDO=1 scripts/manual/capturas.sh                   # prueba el módulo Manual en el navegador
```

`semilla.sql` crea datos de demostración (pacientes, agenda de la semana, atenciones, inventario, RRHH, campañas, medio ambiente). Para una guía nueva: agrega la guía en `guias/`, su captura en `capturas.mjs` y vuelve a correr los pasos.
