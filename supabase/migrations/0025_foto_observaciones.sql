-- EWAH Tech Platform — Observaciones por foto de tratamiento
-- Aplicar con: npx supabase db push --linked
--
-- Un tratamiento puede tener varias fotos "antes" y varias "después"
-- tomadas desde perspectivas distintas (frontal, lateral, zoom a una
-- zona puntual) — sin un campo de texto libre no había forma de que el
-- profesional anotara qué zona/ángulo es cada una.

alter table tratamiento_fotos add column observaciones text;
