-- EWAH Tech Platform — Bloqueo de día completo por profesional
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
--
-- El usuario pidió poder bloquear no solo una franja horaria sino el día
-- completo de uno o varios profesionales a la vez (vacaciones, incapacidad).
-- Un bloqueo de día completo no tiene sentido atado a un consultorio
-- específico (es del profesional, no de una sala), así que consultorio_id
-- deja de ser obligatorio — pero solo para bloqueos: una cita real sigue
-- exigiendo consultorio (constraint actualizado más abajo).

alter table citas add column todo_el_dia boolean not null default false;

alter table citas alter column consultorio_id drop not null;

-- citas_check1 es el nombre por defecto que Postgres le dio al segundo
-- check sin nombre de 0010_citas.sql (el de "es_bloqueo or ..."); "if
-- exists" evita que la migración falle si el nombre real difiere.
alter table citas drop constraint if exists citas_check1;
alter table citas add constraint citas_no_bloqueo_requiere_datos check (
  es_bloqueo or (
    paciente_id is not null
    and tipo_tratamiento_id is not null
    and consultorio_id is not null
  )
);
