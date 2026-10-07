#!/bin/bash
# Prueba las migraciones de Habilitación contra un PostgreSQL 16 LOCAL que
# imita lo mínimo de Supabase (00-stubs-supabase.sql: roles anon /
# authenticated, auth.uid() leído de request.jwt.claim.sub, storage).
# No toca la BD enlazada. Uso (como root, con el cluster local de PG 16):
#
#   scripts/habilitacion/bd-local/probar.sh
#
# 1. Crea la BD `hab_prueba` y aplica 0001..última de supabase/migrations.
#    Entre 0060 y 0061 alinea los uuid de practicas_medicas con los de
#    producción (0058 los genera al azar; 0061 y el mapeo usan los reales).
# 2. Corre cada pareja fN-datos.sql + fN-pruebas.sql (asserts: un fallo
#    detiene todo con código 1).
set -euo pipefail
cd "$(dirname "$0")"
RAIZ="$(cd ../../.. && pwd)"
DB=hab_prueba
PSQL() { su postgres -c "psql -X -q -d $DB -v ON_ERROR_STOP=1" ; }

pg_ctlcluster 16 main start 2>/dev/null || true
su postgres -c "dropdb --if-exists $DB" && su postgres -c "createdb $DB"

aplicar() { echo "  $(basename "$1")"; PSQL < "$1" > /dev/null 2> >(grep -v -E '^(NOTICE|DETAIL|HINT)' >&2); }

alinear_ids() {
  node -e '
    const m = require(process.argv[1]);
    const q = (s) => s.replaceAll("\x27", "\x27\x27");
    for (const r of m) console.log(`update practicas_medicas set id = \x27${r.practica_medica_id}\x27 where codigo = \x27${q(r.grupo_usuario)}\x27 and nombre = \x27${q(r.nombre_usuario)}\x27;`);
    console.log(`do $$ begin if (select count(*) from practicas_medicas where id in (${m.map((r) => `\x27${r.practica_medica_id}\x27`).join(",")})) <> ${m.length} then raise exception \x27ids de practicas_medicas sin alinear\x27; end if; end $$;`);
  ' "$RAIZ/scripts/habilitacion/fuentes/mapeo-servicios.json"
}

echo "Migraciones:"
aplicar 00-stubs-supabase.sql
for f in "$RAIZ"/supabase/migrations/*.sql; do
  n=$(basename "$f" | cut -c1-4)
  if [ "$n" = "0061" ]; then echo "  (alinear ids de practicas_medicas)"; alinear_ids | PSQL > /dev/null; fi
  aplicar "$f"
done

for datos in $(ls f*-datos.sql | sort -V) $(ls sst*-datos.sql 2>/dev/null | sort -V); do
  fase=${datos%-datos.sql}
  echo "Pruebas $fase:"
  PSQL < "$datos" > /dev/null
  PSQL < "$fase-pruebas.sql" 2>&1 >/dev/null | sed -n 's/^NOTICE:  /  /p; /ERROR/p'
done
echo "Todo en verde."
