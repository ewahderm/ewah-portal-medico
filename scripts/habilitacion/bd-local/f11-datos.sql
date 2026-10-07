-- Datos de F11 (corre al final): objetos de storage de la clínica A (uno
-- normal y uno financiero) y un país distinto para la clínica A.
insert into storage.objects (bucket_id, name)
select 'habilitacion', id || '/evidencias/' || gen_random_uuid() || '/' || gen_random_uuid() || '.pdf' from clinicas where nombre = 'Clinica A';
insert into storage.objects (bucket_id, name)
select 'habilitacion', id || '/financiero/' || gen_random_uuid() || '/' || gen_random_uuid() || '.pdf' from clinicas where nombre = 'Clinica A';
