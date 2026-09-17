-- EWAH Tech Platform — Redefine "medios_contacto" como "canales_captacion"
-- Pega esto completo en Supabase → SQL Editor → New Query → Run
-- Requiere 0004_parametros.sql y 0005_pacientes.sql corridos antes.
--
-- El campo original capturaba "medio de contacto preferido" (teléfono,
-- email...). El usuario decidió que en su lugar debe capturar CÓMO el
-- paciente conoció la clínica (Google, redes sociales, recomendado...),
-- útil para atribución de marketing. Se renombra la tabla/columna y se
-- reemplazan los valores sembrados — no es un catálogo nuevo, es el mismo
-- redefinido.

alter table medios_contacto rename to canales_captacion;
alter table pacientes rename column medio_contacto_id to canal_captacion_id;

alter policy "medios_contacto_select_all" on canales_captacion rename to "canales_captacion_select_all";
alter trigger medios_contacto_set_updated_at on canales_captacion rename to canales_captacion_set_updated_at;

delete from canales_captacion;

insert into canales_captacion (codigo, nombre, orden) values
  ('GOOGLE', 'Google / Búsqueda en internet', 1),
  ('INSTAGRAM', 'Instagram', 2),
  ('FACEBOOK', 'Facebook', 3),
  ('TIKTOK', 'TikTok', 4),
  ('RECOMENDADO_PACIENTE', 'Recomendado por otro paciente', 5),
  ('RECOMENDADO_MEDICO', 'Recomendado por un médico', 6),
  ('SITIO_WEB', 'Sitio web de la clínica', 7),
  ('WHATSAPP', 'WhatsApp', 8),
  ('PUBLICIDAD_EXTERIOR', 'Valla o publicidad exterior', 9),
  ('OTRO', 'Otro', 99);
