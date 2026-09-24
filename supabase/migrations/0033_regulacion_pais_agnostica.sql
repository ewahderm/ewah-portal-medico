-- EWAH Tech Platform — Campos regulatorios de Insumos, país-agnósticos
-- Aplicar con: npx supabase db push --linked
--
-- 0031 agregó campos de reporte a insumos con "invima" hardcodeado en el
-- nombre de columna. El usuario pidió explícitamente rediseñarlo para que
-- el día que EWAH abra en otro país (FDA en EE.UU., COFEPRIS en México,
-- ANVISA en Brasil...) no obligue a rehacer el esquema — decisión tomada
-- con consenso de arquitectura backend/frontend/UX:
--
-- 1. Renombrar las columnas de `insumos` a nombres genéricos — un rename
--    in-place preserva los datos ya cargados, sin tabla nueva: cada
--    clínica reporta a UNA sola agencia, así que separar esto en otra
--    tabla sería sobre-normalizar para un caso que no existe.
-- 2. La agencia en sí ("INVIMA") es propiedad de la CLÍNICA (su
--    jurisdicción), no del insumo individual — se agrega como columna en
--    `clinicas`, con default 'INVIMA' para no romper la única clínica real
--    de hoy. Sin catálogo de países/agencias todavía: un solo tenant real
--    no lo justifica, se agrega si/cuando haga falta.
--
-- Fuera de alcance a propósito (anotado para una segunda pasada, no es lo
-- que pidió el usuario en esta ronda): `movimientos_insumos.cantidad_invima`
-- tiene el mismo problema de nombre hardcodeado, pero es un campo distinto
-- en otro módulo (Inventario) — mezclarlo aquí habría sido scope creep.

alter table insumos rename column registro_invima to registro_sanitario;
alter table insumos rename column unidad_medida_invima to unidad_medida_registro_sanitario;
alter table insumos rename column fecha_vencimiento_registro_invima to fecha_vencimiento_registro_sanitario;
alter table insumos rename column reporte_invima to reporte_regulatorio;

alter table clinicas add column agencia_regulatoria text not null default 'INVIMA';
