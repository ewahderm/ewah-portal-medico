-- EWAH Tech Platform — Nuevo estado "reprogramada" para Citas
-- Aplicar con: npx supabase db push --linked
--
-- El usuario pidió poder marcar el resultado de una cita pendiente
-- (asistió/no asistió/reprogramó/etc). "Reprogramar" no es solo una
-- etiqueta: mueve la cita a una fecha/hora nueva. Se modela como dos
-- movimientos, no como una edición de la fecha existente — igual
-- criterio que "Corregir" en Tratamientos ([[tratamientos_module]]):
-- la cita original queda con estado='reprogramada' (deja de ocupar su
-- horario para el detector de choques, ver detectarChoque() en
-- lib/citas/actions.ts, que ya excluye cancelada/no_asistio) y se crea
-- una cita nueva con la fecha/hora elegida — así queda el historial de
-- que esa cita se movió, en vez de perderse la fecha original.

alter table citas drop constraint citas_estado_check;
alter table citas add constraint citas_estado_check
  check (estado in ('agendada', 'confirmada', 'atendida', 'cancelada', 'no_asistio', 'reprogramada'));
