-- ============================================================
-- 0087 · SG-SST · Quitar sst_perfil.codigo_actividad (PENDIENTE)
-- ============================================================
-- NO va en supabase/migrations todavía. Se aplica SOLO DESPUÉS de que el
-- código nuevo de la app (que lee la actividad económica desde
-- clinicas.codigo_actividad_economica, creada y poblada en 0080) esté
-- desplegado en producción. La BD es compartida y se actualiza antes que
-- Vercel: si esta columna desapareciera con el código viejo aún en línea,
-- el perfil SG-SST (select/insert de codigo_actividad) fallaría.
--
-- Entre 0080 y este paso el código viejo puede seguir escribiendo en
-- sst_perfil.codigo_actividad, así que se repite el backfill (solo donde
-- la clínica aún no tiene valor, para no pisar lo guardado en Parámetros)
-- justo antes de borrar la columna.
-- Para aplicarla: copiarla a supabase/migrations con el siguiente número
-- libre y `supabase db push --linked`.

update clinicas c
set codigo_actividad_economica = nullif(trim(sp.codigo_actividad), '')
from sst_perfil sp
where sp.clinica_id = c.id
  and c.codigo_actividad_economica is null
  and nullif(trim(sp.codigo_actividad), '') is not null;

alter table sst_perfil drop column codigo_actividad;
