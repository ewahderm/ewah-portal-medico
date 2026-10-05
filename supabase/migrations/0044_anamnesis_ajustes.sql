-- EWAH Tech Platform — Ajustes a Anamnesis tras feedback del usuario
-- Aplicar con: npx supabase db push --linked
--
-- La anamnesis no debe ligarse a un tratamiento específico (es sobre el
-- paciente en general, no el seguimiento de un procedimiento — ese caso ya
-- lo cubre evoluciones_paciente), así que se quita tratamiento_id. Zona a
-- tratar y próximo control tampoco aplican a este formulario. De paso se
-- agrega habitos_otros, igual al patrón _otros ya usado en antecedentes/
-- alergias/medicamentos.

alter table anamnesis_paciente
  drop column tratamiento_id,
  drop column zona_a_tratar,
  drop column proximo_control_fecha,
  add column habitos_otros text;
