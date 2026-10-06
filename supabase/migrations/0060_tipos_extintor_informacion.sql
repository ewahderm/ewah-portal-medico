-- Tipos de extintor con información útil para consultorios y clínicas
-- (pedido del usuario 2026-10-06). Hasta ahora el catálogo era solo
-- nombre+código, sembrado únicamente para EWAH (0035) — las demás clínicas
-- quedaban sin tipos y nadie sabía qué extintor sirve para qué.
-- Aplicar con: npx supabase db push --linked
--
-- Fuentes consultadas en vivo el 2026-10-06:
--   - IPES (Alcaldía de Bogotá), Instructivo IN-097 Extintores (2020):
--     clases de fuego A/B/C/D/K, tipos comercializados en Colombia, colores
--     y normas aplicables (NTC 652, NTC 1916, NTC 2885 = adopción de NFPA 10).
--     "Los extinguidores químicos de uso múltiple dejan un residuo que puede
--     ser dañino para los equipos delicados... Los de Dióxido de Carbono se
--     prefieren en estos casos". "NO UTILICE Dióxido de Carbono... con los
--     fuegos de clase A". "NO UTILIZAR los extinguidores de agua para
--     combatir fuegos en los equipos energizados".
--   - Ministerio de Ambiente, sector de protección contra incendios y
--     Boletín 45: el HCFC-123 (Solkaflam) es sustancia controlada del
--     Protocolo de Montreal, con cupos de importación decrecientes
--     (Res. 2749/2017) y eliminación prevista para 2040; no está prohibido
--     su uso, pero se recomienda evaluar sustitutos. Internacionalmente el
--     agente halogenado más usado en portátiles es el HFC-236fa. Advierte
--     que mezclarlo con HCFC-141b "podría ser extremadamente peligrosa".
--     Halones: importación cero desde 2010 (Res. 901/2006).
--   - Res. 3100/2019 solo exige extintor explícito (ABC, mín. 2,26 kg) en
--     ambulancias; para edificaciones rige NSR-10 Título J + NTC 2885.
--
-- Clase D (metales combustibles) se omite a propósito: no aplica a
-- servicios de salud. Tipo K queda sembrado pero solo es pertinente si la
-- clínica tiene cocina o cafetería con freidoras.
--
-- La periodicidad de inspección/recarga NO se guarda aquí: la clínica la
-- toma del sticker del extintor (criterio ya fijado en 0035).

alter table tipos_extintor
  add column clases_fuego text,
  add column color text,
  add column uso_recomendado text,
  add column advertencia text,
  add column norma text;

-- 0035 sembró "PQS" pensando en el polvo químico genérico, duplicando a
-- "MULTIPROPOSITO" (que ES polvo químico ABC). En el mercado colombiano el
-- PQS que no es multipropósito es el BC (cilindro rojo) — se aclara el
-- nombre. Seguro: al aplicar esto ningún extintor referenciaba ese tipo.
update tipos_extintor set nombre = 'Polvo químico seco BC (PQS BC)' where codigo = 'PQS';
update tipos_extintor set nombre = 'Multipropósito ABC (polvo químico seco)' where codigo = 'MULTIPROPOSITO';

create or replace function fn_sembrar_tipos_extintor(p_clinica_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into tipos_extintor (clinica_id, codigo, nombre, clases_fuego, color, uso_recomendado, advertencia, norma, orden)
  values
    (p_clinica_id, 'MULTIPROPOSITO', 'Multipropósito ABC (polvo químico seco)', 'A, B, C', 'Amarillo',
     'El más versátil y el de uso general: pasillos, salas de espera, recepción, consultorios, archivo y rutas de evacuación.',
     'Deja un residuo de polvo que puede dañar equipos biomédicos y electrónicos — cerca de ellos prefiera CO2 o agente limpio.',
     'NTC 652, NTC 1916, NTC 2885 (NFPA 10)', 1),
    (p_clinica_id, 'CO2', 'Dióxido de carbono (CO2)', 'B, C', 'Rojo',
     'Equipos eléctricos y electrónicos energizados: tableros eléctricos, cuarto de servidores, equipos de diagnóstico, laboratorio. No deja residuo.',
     'No es apto para fuegos clase A (papel, madera, telas). Desplaza el oxígeno: no usar en espacios cerrados pequeños con personas.',
     'NTC 2885 (NFPA 10)', 2),
    (p_clinica_id, 'AGENTE_LIMPIO', 'Agente limpio (HFC-236fa / FK-5-1-12)', 'B, C (algunos modelos también A)', 'Blanco o rojo, según fabricante',
     'Zonas con equipos biomédicos sensibles o de alto costo: quirófanos y salas de procedimientos, rayos X, equipos láser, servidores. No deja residuo.',
     'Verifique en la etiqueta del extintor las clases de fuego para las que está certificado.',
     'NTC 2885 (NFPA 10)', 3),
    (p_clinica_id, 'PQS', 'Polvo químico seco BC (PQS BC)', 'B, C', 'Rojo',
     'Áreas con líquidos inflamables y equipo eléctrico: planta eléctrica, cuarto de máquinas, almacenamiento de alcohol y solventes.',
     'No es apto para fuegos clase A. Deja residuo de polvo.',
     'NTC 2885 (NFPA 10)', 4),
    (p_clinica_id, 'AGUA', 'Agua a presión', 'A', 'Plateado',
     'Materiales sólidos comunes: archivo de historias clínicas en papel, depósitos de lencería, cartón y papel.',
     'NUNCA en equipos eléctricos energizados ni en líquidos inflamables.',
     'NTC 652, NTC 1916, NTC 2885 (NFPA 10)', 5),
    (p_clinica_id, 'ESPUMA', 'Espuma (AFFF)', 'A, B', 'Plateado o crema, según fabricante',
     'Poco frecuente en consultorios: solo si hay depósito de combustibles o líquidos inflamables en volumen.',
     'No usar en equipos eléctricos energizados.',
     'NTC 2885 (NFPA 10)', 6),
    (p_clinica_id, 'SOLKAFLAM', 'Solkaflam (HCFC-123)', 'A, B, C', 'Blanco',
     'Agente limpio tradicional en Colombia para equipos electrónicos; aún se vende y recarga.',
     'Sustancia controlada del Protocolo de Montreal: importación restringida y eliminación prevista para 2040 (MinAmbiente). Para equipos nuevos prefiera agente limpio HFC-236fa o FK-5-1-12. Nunca acepte recargas mezcladas con HCFC-141b.',
     'NTC 652, NTC 1916, NTC 2885 (NFPA 10)', 7),
    (p_clinica_id, 'TIPO_K', 'Tipo K (acetato de potasio)', 'K', 'Plateado (acero inoxidable)',
     'Solo si la clínica tiene cocina o cafetería con freidoras: fuegos de aceites y grasas de cocina.',
     'No aplica a consultorios sin servicio de alimentación.',
     'NTC 2885 (NFPA 10)', 8)
  on conflict (clinica_id, codigo) do update set
    clases_fuego = excluded.clases_fuego,
    color = excluded.color,
    uso_recomendado = excluded.uso_recomendado,
    advertencia = excluded.advertencia,
    norma = excluded.norma;
$$;

revoke all on function fn_sembrar_tipos_extintor(uuid) from public, anon, authenticated;

-- Todas las clínicas existentes.
select fn_sembrar_tipos_extintor(id) from clinicas;

-- Toda clínica nueva nace con el catálogo (en vez de tocar bootstrap_clinica,
-- que ya tiene 7 versiones).
create or replace function fn_clinicas_sembrar_tipos_extintor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fn_sembrar_tipos_extintor(new.id);
  return new;
end;
$$;

create trigger clinicas_sembrar_tipos_extintor
  after insert on clinicas
  for each row execute function fn_clinicas_sembrar_tipos_extintor();
