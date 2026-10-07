#!/bin/bash
# Supabase COMPLETO en local (docker: Postgres, Auth, REST, Storage) con
# 0001..última migración y la clínica EWAH con 1 sede + 11.2.2 mediana
# intramural (465 criterios), para probar la app en un navegador real sin
# tocar la BD enlazada. Usuario: admin@ewah.local / Prueba-local-123!
#
#   scripts/habilitacion/supabase-local/levantar.sh     # una vez
#   (cd apps/web && cp ../../scripts/habilitacion/supabase-local/env.local .env.local && npx next dev)
#   node scripts/habilitacion/supabase-local/recorrido-f5.mjs   # (desde apps/web, ver el archivo)
#   npx supabase stop --workdir "$TMP_SB"                       # al terminar; borrar apps/web/.env.local
#
# Las migraciones NO se aplican con `supabase start` (0002 pide el correo
# del admin y 0061 necesita los uuid reales de practicas_medicas): se arranca
# con una carpeta de migraciones vacía y se aplican aquí en orden.
set -euo pipefail
R="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_SB="${TMP_SB:-/tmp/ewah-supabase-local}"
DBURL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SR=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU  # clave demo pública del CLI

docker info > /dev/null 2>&1 || { (dockerd > /tmp/dockerd.log 2>&1 &); until docker info > /dev/null 2>&1; do sleep 1; done; }
mkdir -p "$TMP_SB/supabase/migrations"
sed 's/^project_id = .*/project_id = "ewah-local"/' "$R/supabase/config.toml" > "$TMP_SB/supabase/config.toml"
# `start` a veces revisa el estado antes de que Postgres termine de
# arrancar y sale con StatusDbNotReadyError: se tolera y se espera aquí.
npx -y supabase@latest start --workdir "$TMP_SB" -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta || true
until psql -q "$DBURL" -c 'select 1' > /dev/null 2>&1; do sleep 2; done
until curl -sf http://127.0.0.1:54321/auth/v1/health -H "apikey: $SR" > /dev/null; do sleep 2; done
# Siempre desde cero (la carpeta de migraciones del workdir está vacía):
# idempotente aunque una corrida anterior haya quedado a medias.
npx -y supabase@latest db reset --workdir "$TMP_SB" > /dev/null
until curl -sf http://127.0.0.1:54321/auth/v1/health -H "apikey: $SR" > /dev/null; do sleep 2; done

curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SR" -H "Authorization: Bearer $SR" \
  -H 'Content-Type: application/json' -d '{"email":"admin@ewah.local","password":"Prueba-local-123!","email_confirm":true}' > /dev/null

for f in "$R"/supabase/migrations/*.sql; do
  n=$(basename "$f" | cut -c1-4)
  if [ "$n" = "0061" ]; then
    node -e '
      const m = require(process.argv[1]); const q = (s) => s.replaceAll("\x27", "\x27\x27");
      for (const r of m) console.log(`update practicas_medicas set id = \x27${r.practica_medica_id}\x27 where codigo = \x27${q(r.grupo_usuario)}\x27 and nombre = \x27${q(r.nombre_usuario)}\x27;`);
    ' "$R/scripts/habilitacion/fuentes/mapeo-servicios.json" | psql -q "$DBURL" > /dev/null
  fi
  if [ "$n" = "0002" ]; then
    sed "s/'ADMIN_EMAIL'/'admin@ewah.local'/; s/'ADMIN_NOMBRE'/'Admin Local'/" "$f" | psql -q -v ON_ERROR_STOP=1 "$DBURL" > /dev/null
  else
    psql -q -v ON_ERROR_STOP=1 "$DBURL" -f "$f" > /dev/null 2> >(grep -v NOTICE >&2)
  fi
done

psql -q -v ON_ERROR_STOP=1 "$DBURL" <<'SQL'
insert into sedes (clinica_id, codigo, nombre, orden, uso_edificacion)
select id, 'PRINC', 'Sede Principal Local', 1, 'exclusivo_salud' from clinicas where nombre = 'EWAH S.A.S.';
insert into clinica_servicios_habilitados (clinica_id, practica_medica_id, sede_id, modalidades, complejidad)
select c.id, pm.id, s.id, '{intramural}', 'mediana'
from clinicas c join sedes s on s.clinica_id = c.id and s.codigo = 'PRINC'
cross join lateral (select id from practicas_medicas where nombre like 'Especialidades Médicas%' limit 1) pm
where c.nombre = 'EWAH S.A.S.';
insert into hab_perfil_prestador (clinica_id, tipo_prestador, estado_reps) select id, 'ips', 'en_tramite' from clinicas where nombre = 'EWAH S.A.S.';
SQL
echo "Listo: http://127.0.0.1:54321 · admin@ewah.local / Prueba-local-123!"
