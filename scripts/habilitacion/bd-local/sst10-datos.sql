-- SG-SST F9: un archivo de A en el bucket sst (como lo dejaría una subida).
insert into storage.objects (bucket_id, name)
select 'sst', id || '/documentos/00000000-0000-0000-0000-000000000f90/acta.pdf' from clinicas where nombre = 'Clinica A';
