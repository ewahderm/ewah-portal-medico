-- Prerrequisitos de recorrido-f7-f8.mjs (sobre una BD recién levantada):
-- EWAH como IPS persona jurídica, D2, privada, en trámite, IPS nueva y sede
-- construida en 2003.
update clinicas set tipo_persona_id = (select id from tipos_persona where codigo = 'JURIDICA') where nombre = 'EWAH S.A.S.';
update hab_perfil_prestador set grupo_supersalud = 'D2', naturaleza = 'privada', estado_reps = 'en_tramite', es_ips_nueva = true
where clinica_id = (select id from clinicas where nombre = 'EWAH S.A.S.');
update sedes set fecha_construccion_intervencion = '2003-06-01' where codigo = 'PRINC';
