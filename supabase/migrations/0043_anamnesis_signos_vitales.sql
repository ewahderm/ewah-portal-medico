-- EWAH Tech Platform — Talla/peso/tipo de sangre en Anamnesis
-- Aplicar con: npx supabase db push --linked
--
-- Completa el examen físico de anamnesis_paciente (0042): dato básico de
-- identificación biométrica que la Resolución 1995/1999 espera en toda
-- historia clínica y que además es relevante clínicamente para calcular
-- dosis de medicamentos/anestésicos en procedimientos estéticos.

alter table anamnesis_paciente
  add column talla_cm numeric,
  add column peso_kg numeric,
  add column tipo_sangre text;
