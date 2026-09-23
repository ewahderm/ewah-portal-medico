-- EWAH Tech Platform — Creación rápida de paciente desde Agenda
-- Aplicar con: npx supabase db push --linked
--
-- El usuario pidió poder crear un paciente desde el módulo de Agenda con
-- solo nombre, apellido, correo y teléfono — muchas veces el paciente no
-- comparte su documento de identidad por teléfono/WhatsApp y se completa
-- en el consultorio. Para eso, tipo y número de identificación dejan de
-- ser obligatorios a nivel de base de datos (el formulario completo de
-- Pacientes los sigue exigiendo por su cuenta, en la aplicación).
-- La unicidad (clinica_id, tipo_identificacion_id, numero_identificacion)
-- no se ve afectada: Postgres trata cada NULL como distinto en un unique
-- constraint, así que varios pacientes sin documento aún no chocan entre sí.
--
-- Un paciente sin documento (o sin correo/teléfono, para los ya
-- existentes creados antes de este cambio) queda con "información
-- pendiente" — ver lib/pacientes/completitud.ts. No se agrega una
-- columna para eso: se calcula en el momento a partir de estos mismos
-- campos, para no tener que mantener un booleano sincronizado.

alter table pacientes alter column tipo_identificacion_id drop not null;
alter table pacientes alter column numero_identificacion drop not null;
