-- Prerrequisitos de recorrido-f9-f10.mjs (después de los recorridos F5..F8):
-- EWAH inscrita (vencimiento REPS a 80 días), FT001 con correo adicional y
-- una fecha manual de FT001 a 3 días.
update hab_perfil_prestador set estado_reps = 'inscrito',
  fecha_inscripcion_inicial = (now() at time zone 'America/Bogota')::date - 200,
  fecha_vencimiento_reps = (now() at time zone 'America/Bogota')::date + 80;
update hab_obligaciones_clinica set correo_adicional = 'contador@externo.co'
  where obligacion_id = (select id from hab_obligaciones_catalogo where codigo = 'FT001');
insert into hab_obligacion_ocurrencias (clinica_id, obligacion_id, origen, clave_periodo, etiqueta_periodo, fecha_limite, generada_por)
select c.id, o.id, 'manual', 'prueba-f9', 'Prueba F9', (now() at time zone 'America/Bogota')::date + 3, 'usuario'
from clinicas c, hab_obligaciones_catalogo o where c.nombre = 'EWAH S.A.S.' and o.codigo = 'FT001';
delete from hab_alertas_enviadas;
-- Un "No cumple" (como el admin) para que el cierre muestre el aviso.
select set_config('request.jwt.claim.sub', (select id::text from usuarios where email = 'admin@ewah.local'), false);
select fn_hab_evaluar(s.id, (
  select criterio_id from fn_hab_tablero_criterios(s.id)
  where not es_encabezado and not autorresuelto and servicio_clave <> '11.1' order by orden limit 1
), 'no_cumple', null, 'Falta el soporte (recorrido F9/F10)')
from sedes s where s.codigo = 'PRINC';
