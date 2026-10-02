-- EWAH Tech Platform — Dirección y contacto de emergencia del paciente
--
-- Hallazgo del repaso de director-proyecto (2026-10-02): la Resolución 1995
-- de 1999 (contenido mínimo de historia clínica) exige dirección de
-- residencia y datos de un acompañante/contacto de emergencia como parte de
-- la identificación del paciente — ninguno de los dos existía. El resto de
-- campos que la misma resolución lista (municipio/zona, régimen de EPS,
-- estado civil, ocupación) se dejan pendientes a propósito: son necesarios
-- sobre todo para reportar RIPS, que esta clínica no genera todavía, y por
-- minimización de datos (Ley 1581 de 2012) no se capturan hasta que haya un
-- uso real.
--
-- Contacto de emergencia es el más urgente de los dos: esta clínica hace
-- procedimientos médicos reales (toxina, ácido hialurónico, láser) y hoy no
-- hay forma de contactar a nadie más que al propio paciente ante una
-- complicación.

alter table pacientes
  add column direccion text,
  add column contacto_emergencia_nombre text,
  add column contacto_emergencia_telefono text;
