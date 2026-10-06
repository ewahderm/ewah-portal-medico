-- EWAH Tech Platform — Corrección: clases_riesgo.tarifa_arl se declaró
-- numeric(6,4) (4 decimales), pero las tarifas reales del Decreto 1607/2002
-- tienen 5 decimales (ej. 0.01044) — Postgres las redondeó en silencio a 4
-- decimales (0.0104) al insertarlas, corriendo el cálculo de ARL en cada
-- comprobante de nómina. Detectado verificando a mano el resultado de un
-- comprobante de prueba contra el cálculo esperado.
alter table clases_riesgo alter column tarifa_arl type numeric(8,5);

update clases_riesgo set tarifa_arl = 0.00522 where codigo = 'I';
update clases_riesgo set tarifa_arl = 0.01044 where codigo = 'II';
update clases_riesgo set tarifa_arl = 0.02436 where codigo = 'III';
update clases_riesgo set tarifa_arl = 0.04350 where codigo = 'IV';
update clases_riesgo set tarifa_arl = 0.06960 where codigo = 'V';
