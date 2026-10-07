# Habilitación · F11 — revisión de seguridad y regresión

Fecha: 2026-10-07. Alcance: migraciones 0061–0071, `apps/web/lib/habilitacion/**`, rutas
`app/(protected)/habilitacion/**`, `app/api/exportar/habilitacion/[id]`, `app/api/cron/diario`.

## Resultado

**Sin hallazgos críticos ni altos abiertos.** Ninguna vía encontrada para leer ni escribir
datos de otra clínica. Se corrigieron 6 hallazgos de severidad media o baja; quedan 2 riesgos
aceptados, que se explican abajo.

## Qué se verificó (automatizado, repetible)

| Verificación | Cómo | Resultado |
|---|---|---|
| Aislamiento de lectura en **todas** las tablas `hab_*` con `clinica_id` (15) | `bd-local/f11-pruebas.sql`: un usuario de la clínica B cuenta las filas ajenas, tabla por tabla, con datos de A presentes en todas | 0 filas ajenas |
| `anon` no lee nada (incluidos los catálogos) | mismo archivo, todas las tablas y vistas `hab_*` | 0 filas |
| RLS activo en todas las tablas `hab_*`; vistas `security_invoker` | catálogo de Postgres | todas |
| Funciones `security definer`: `anon` no ejecuta ninguna; `authenticated` solo las 9 RPC previstas (cada una se fija a `clinica_actual()` y exige permiso) | `has_function_privilege` contra una lista cerrada | lista exacta |
| IDOR por FK (sede, criterio, evaluación, ocurrencia y storage de otra clínica) | intentos desde B con ids de A: evaluar, evidencia, documento, edificación, anular ocurrencia, resumen de evidencia, editar perfil y declaración | todos rechazados o sin efecto |
| Mapa FK → guardia de misma clínica | consulta de `pg_constraint` × triggers `fn_hab_misma_clinica` | cubiertas, salvo las columnas de autoría (H1) |
| Storage `habilitacion` | B no ve ni sube en la carpeta de A; solo VIEW no ve `financiero/`; nadie modifica ni borra por la API | ok |
| Fotos de autoevaluación inmutables y sin inserción directa | `bd-local/f9-pruebas.sql` | ok |
| Server actions y rutas | revisión de código: todas las actions exportadas llaman `requireHabilitacion` antes de escribir; ninguna acepta `clinica_id` del cliente; rutas de Storage armadas en el servidor y verificadas por firma; URLs firmadas solo tras leer la fila con RLS (incluida la restrictiva de `financiero/`); service role solo en el cron y al borrar un archivo propio que no pasó la verificación | ok |
| Regresión en navegador F5→F10 desde una BD limpia | `supabase-local/regresion.sh` (4 recorridos, móvil 390 px, `/citas`) | en verde, sin errores de consola |

## Hallazgos corregidos

| Id | Severidad | Hallazgo | Corrección |
|---|---|---|---|
| H1 | Media | `created_by` / `updated_by` los enviaba el cliente en 7 tablas (documentos y versiones, hitos, suficiencia, novedades, perfil, asignaciones). Por PostgREST se podía registrar algo "a nombre de" otra persona, incluso con un uuid de otra clínica. | 0071: trigger `fn_hab_forzar_autor` que toma la autoría de la sesión |
| F10 | Media | Las políticas de insert de las tablas de la foto permitían a quien tiene APPROVE insertar una cabecera con un resumen fabricado o filas de detalle sueltas | 0070: la RPC de cierre es `security definer` y no hay políticas de insert |
| H2 | Baja | `fn_hab_pais_clinica` devolvía el país de cualquier clínica dado su id | 0071: a los usuarios solo les responde la de su propia clínica |
| H4 | Baja | Al anular una autoevaluación, la ocurrencia del REPS seguía "presentada" con la foto anulada como única prueba | 0071: se anula esa ocurrencia y se reabre el periodo |
| H5 | Baja | La política de insert de Storage dejaba subir cualquier archivo a la carpeta propia sin pasar por `prepararSubida` (sin tope ni formato) | 0071: el bucket limita a 10 MB y a los 6 formatos admitidos |
| T1 | Baja | El nombre original del archivo iba sin limpiar al `Content-Disposition` de la descarga | `nombreSeguro()` en `servidor.ts` (sin controles, comillas ni barras) |
| T2 | Baja | El nombre comercial de la clínica iba sin escapar en el `From` del correo (un nombre con `<`, `,` o `"` rompe el envío o finge otra dirección) | `construirRemitente` lo limpia y lo entrecomilla (afecta a todos los correos) |
| H3 | Higiene | Funciones de trigger con EXECUTE para `anon`/`authenticated` (no se pueden invocar fuera de un trigger) | 0071: revocadas |

## Riesgos aceptados (decisión de producto)

1. **Correo adicional de una obligación**: quien tiene EDIT puede poner cualquier dirección y
   EWAH le enviará los avisos de esa obligación. No expone datos de otras obligaciones ni de
   otras clínicas: el correo solo lleva lo de esa obligación y no trae enlaces. Si se quiere
   cerrar del todo: confirmación por correo o restringirlo a APPROVE.
2. **Archivos huérfanos dentro de la propia clínica**: aun con el tope del bucket, un usuario
   con CREATE puede subir por la API archivos válidos que nunca registra. No hay escalamiento,
   el registro lo verifica todo y los archivos quedan solo en su carpeta. Una limpieza periódica
   de objetos sin fila es mejora futura.

## Cómo repetirlo

```
scripts/habilitacion/bd-local/probar.sh                 # 196 asserts (PG 16 local)
scripts/habilitacion/supabase-local/regresion.sh        # navegador, F5→F10 (docker)
cd apps/web && npx vitest run                           # 99 pruebas
```
