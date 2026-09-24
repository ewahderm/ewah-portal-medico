-- EWAH Tech Platform — Corrige datos dejados por un bug real (no schema)
-- Aplicar con: npx supabase db push --linked
--
-- revertirAnulacionTratamiento() reactivaba un tratamiento sin anular
-- también el registro que lo había reemplazado (vía corrige_a, creado por
-- "Editar" o por "Anular + Corregir") — corregido en el código el
-- 2026-09-23. Este fix es solo de datos: re-anula cualquier tratamiento
-- que, a día de hoy, quedó activo (anulado=false) teniendo a la vez un
-- reemplazo activo apuntándole. Reportado en vivo con el paciente de
-- prueba "camila peña" (dos "Toxina botulínica" activas a la vez), pero
-- se corrige de forma general por si quedó algún otro caso igual.

update tratamientos original
set
  anulado = true,
  anulado_motivo = 'Anulado retroactivamente: el registro que lo reemplazaba (corrige_a) seguía activo a la vez, por el bug de revertir anulación corregido el 2026-09-23.',
  anulado_en = now()
where original.anulado = false
  and exists (
    select 1 from tratamientos corregido
    where corregido.corrige_a = original.id
      and corregido.anulado = false
  );
