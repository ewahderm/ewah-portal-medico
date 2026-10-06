-- Búsqueda de CUPS sin tildes — mismo patrón que Pacientes (0005,
-- f_unaccent()+pg_trgm ya creados ahí, reusados aquí tal cual). Sin esto,
-- buscar "botulinica" no encuentra "TOXINA BOTULÍNICA": con ~10.000
-- códigos y un admin que no siempre escribe tildes, era un bug real de
-- usabilidad detectado al verificar la pestaña CUPS recién construida.
alter table cups add column busqueda text generated always as (
  f_unaccent(lower(codigo || ' ' || descripcion))
) stored;

create index idx_cups_busqueda_trgm on cups using gin (busqueda gin_trgm_ops);
