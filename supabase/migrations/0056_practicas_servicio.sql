-- Segundo nivel bajo los servicios REPS de practicas_medicas (0055): las
-- prácticas concretas que una clínica realmente ofrece (Medicina General,
-- Pediatría, Fisioterapia...) — REPS solo conoce el servicio ("Consulta
-- Externa Especializada"), pero el futuro módulo de Habilitación necesita
-- saber QUÉ especialidad concreta presta la clínica para armar su
-- checklist de talento humano/dotación. Decisión del usuario (2026-10-06):
-- dos niveles, los 39 servicios oficiales se mantienen intactos y cada
-- práctica cuelga de uno de ellos.
--
-- Fuente de las 22 prácticas, su complejidad y sus requisitos: material de
-- trabajo del usuario (docs/regulatorio/servicios-requisitos-habilitacion-res3100.md)
-- — NO es transcripción literal de la resolución, por eso `requisitos` es
-- texto de referencia, nunca una regla de validación. Lo que SÍ se
-- verificó contra el PDF oficial (minsalud.gov.co, resolucion-3100-de-2019.pdf)
-- es a qué servicio REPS pertenece cada práctica:
--   - 11.2.1 Consulta Externa General: menciona consultorio odontológico,
--     "consulta externa de medicina general" y profesional de enfermería.
--     Psicología va aquí por ser profesión sin especialidad médica.
--   - 11.2.2 Consulta Externa Especializada: especialidades médicas
--     (Pediatría, Cardiología).
--   - 11.3.1 Terapias: "Incluye: Fisioterapia o terapia física...".
--   - 11.4.1 Hospitalización: incluye habitaciones para pacientes
--     pediátricos (no hay un servicio de hospitalización pediátrica aparte).
--   - 11.5.1 Cirugía: servicio único, con requisitos propios "si realiza
--     exclusivamente procedimientos de cirugía ambulatoria". La resolución
--     define su complejidad como "Mediana y alta" — el documento del
--     usuario decía "Baja / Media" para Cirugía Ambulatoria; se usa la
--     del texto oficial.
--   - 11.6.2 Transporte Asistencial: complejidad baja/mediana (TAB/TAM).
--
-- `codigo` se reutiliza con el nombre del servicio REPS padre (mismo truco
-- que 0055 con el grupo) para que el motor genérico de Parámetros muestre
-- el catálogo agrupado sin UI nueva. La FK real es practica_medica_id.
create table practicas_servicio (
  id uuid primary key default gen_random_uuid(),
  practica_medica_id uuid not null references practicas_medicas(id) on delete cascade,
  codigo text,
  nombre text not null,
  complejidad text,
  requisitos text,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger practicas_servicio_set_updated_at
  before update on practicas_servicio
  for each row execute function set_updated_at();

create index idx_practicas_servicio_practica_medica on practicas_servicio(practica_medica_id);

alter table practicas_servicio enable row level security;

create policy "practicas_servicio_select" on practicas_servicio
  for select to authenticated using (true);

insert into practicas_servicio (practica_medica_id, codigo, nombre, complejidad, requisitos, orden)
select pm.id, pm.nombre, v.nombre, v.complejidad, v.requisitos, v.orden
from (values
  ('Consulta Externa General', 'Medicina General', 'Baja',
   'Título de médico general, inscripción en RETHUS. Dotación básica: tensiómetro, fonendoscopio, báscula, camilla, cinta métrica. Guías de Práctica Clínica (GPC) adoptadas.', 1),
  ('Consulta Externa General', 'Odontología General', 'Baja',
   'Título de odontólogo, RETHUS. Unidad odontológica completa, compresor, protocolo de bioseguridad y esterilización, amalgamas/resinas. Licencia si tiene RX.', 2),
  ('Consulta Externa General', 'Enfermería', 'Baja',
   'Título de enfermera(o) profesional. RETHUS. Insumos para curaciones, retiro de puntos, promoción y prevención.', 3),
  ('Consulta Externa General', 'Psicología', 'Baja',
   'Título de psicólogo clínico. Área que garantice privacidad acústica y visual. Pruebas psicométricas (si aplica) con derechos de uso.', 4),
  ('Consulta Externa Especializada', 'Pediatría', 'Media / Alta',
   'Título de especialista en Pediatría, RETHUS. GPC para atención infantil, báscula pediátrica, infantómetro, cintas métricas, dotación básica.', 10),
  ('Consulta Externa Especializada', 'Cardiología', 'Media / Alta',
   'Título de especialista en Cardiología. Electrocardiógrafo. Protocolo de lectura y entrega de resultados oportunos. GPC para riesgo cardiovascular.', 11),
  ('Terapias', 'Fisioterapia / Rehabilitación Física', 'Baja',
   'Fisioterapeuta con RETHUS. Equipos biomédicos (ultrasonido, TENS, etc.) con mantenimiento. Colchonetas, bandas, protocolo de desinfección de equipos.', 20),
  ('Servicio Farmacéutico', 'Servicio Farmacéutico', 'Baja / Media / Alta',
   'Director Técnico: Químico Farmacéutico (Media/Alta) o Regente de Farmacia (Baja). Termohigrómetros calibrados, actas de recepción técnica, áreas separadas (cuarentena, aprobados, controlados).', 21),
  ('Imágenes Diagnósticas — radiaciones ionizantes', 'Imágenes Diagnósticas (ionizantes)', 'Baja / Media / Alta',
   'Licencia de práctica médica vigente. Oficial de radioprotección. Dosimetría de personal. Título de Tecnólogo en radiología y Médico radiólogo (Media/Alta). Blindaje aprobado.', 22),
  ('Imágenes Diagnósticas — radiaciones no ionizantes', 'Imágenes Diagnósticas (no ionizantes — ecografías)', 'Baja / Media',
   'Título de médico especialista con entrenamiento certificado. Ecógrafo con transductores adecuados. Medio de contraste y carro de paros (si aplica).', 23),
  ('Toma de Muestras de Laboratorio Clínico', 'Toma de Muestras', 'Baja',
   'Personal con certificado en toma de muestras. Sillas para toma de muestras. Insumos rotulados, ruta de transporte de muestras y convenio de procesamiento.', 24),
  ('Laboratorio Clínico', 'Laboratorio Clínico', 'Baja / Media / Alta',
   'Título de Bacteriólogo o Microbiólogo. Constancia de control de calidad interno y externo. Calibración de equipos. Cadena de frío (neveras y termohigrómetros). PGIRASA.', 25),
  ('Hospitalización', 'Hospitalización Adultos', 'Baja / Media / Alta',
   'Enfermera(o) profesional y auxiliar de enfermería 24/7. Sistema de llamado al paciente en cama y baño. Red de gases medicinales. Carro de paros por servicio.', 30),
  ('Hospitalización', 'Hospitalización Pediátrica', 'Media / Alta',
   'Mismos de adultos + Especialista en Pediatría. Cunas/camas con barandas seguras. Ambiente y decoración amigable. Sala de juegos (deseable).', 31),
  ('Cuidado Intensivo Adultos', 'Cuidado Intensivo Adultos (UCI)', 'Alta',
   'Intensivista presencial o disponibilidad. Equipo de monitorización continua invasiva y no invasiva, 1 ventilador mecánico por cama. Interdependencia con Lab Clínico, Banco de Sangre, RX y Cirugía 24/7.', 32),
  ('Cuidado Intermedio Neonatal', 'Cuidado Intermedio Neonatal', 'Alta',
   'Pediatra neonatólogo. Incubadoras de calor radiante, monitores neonatales, bombas de infusión (microgoteo), oxímetros neonatales.', 33),
  ('Cirugía', 'Cirugía Ambulatoria', 'Mediana',
   'Cirujano y Anestesiólogo. Sala de cirugía (tamaño normativo), revestimientos epóxicos. Máquina de anestesia, mesa, lámpara cialítica. Área de recuperación (RPA). Lista de chequeo de cirugía segura.', 40),
  ('Cirugía', 'Cirugía General / Especializada', 'Mediana / Alta',
   'Equipos de cirugía de alta complejidad (torres de laparoscopia, bisturí armónico, etc.). Convenio o área propia de esterilización (central de esterilización validada). UCI de respaldo (para alta complejidad).', 41),
  ('Urgencias', 'Urgencias', 'Baja / Media / Alta',
   'Médico presencial 24/7. Cursos de soporte vital (BLS/ACLS) y atención víctimas de violencia sexual. Sala de reanimación equipada (carro paros, monitor, DEA/desfibrilador). Consultorios de Triage. Gases medicinales continuos.', 50),
  ('Atención del Parto', 'Atención del Parto', 'Baja / Media',
   'Médico general/especialista o Enfermera con entrenamiento. Sala de trabajo de parto, parto y recuperación (TPR). Mesa ginecológica, pinzas umbilicales, equipo de reanimación neonatal. Incubadora de transporte.', 51),
  ('Transporte Asistencial', 'Transporte Asistencial Básico (TAB)', 'Baja',
   'Documentos del vehículo (SOAT, tecno-mecánica). Tecnólogo APH o Auxiliar con BLS. Camilla con anclaje, oxígeno, maletín de urgencias, inmovilizadores.', 52),
  ('Transporte Asistencial', 'Transporte Asistencial Medicalizado (TAM)', 'Mediana',
   'Médico capacitado (ACLS) + Tecnólogo APH/Auxiliar. Monitor desfibrilador, ventilador de transporte, bombas de infusión, medicamentos de urgencias y controlados. Inversor de corriente funcional.', 53)
) as v(servicio, nombre, complejidad, requisitos, orden)
join practicas_medicas pm on pm.nombre = v.servicio;

-- Qué prácticas ofrece cada clínica, colgadas de la fila de servicio
-- habilitado (no directo de la clínica): así el código de habilitación
-- sigue siendo uno por servicio REPS (Pediatría y Cardiología comparten el
-- de Consulta Externa Especializada), y quitar un servicio se lleva sus
-- prácticas por cascade.
create table clinica_practicas_servicio (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  servicio_habilitado_id uuid not null references clinica_servicios_habilitados(id) on delete cascade,
  practica_servicio_id uuid not null references practicas_servicio(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references usuarios(id),
  unique (servicio_habilitado_id, practica_servicio_id)
);

create trigger clinica_practicas_servicio_auditoria
  after insert or update or delete on clinica_practicas_servicio
  for each row execute function fn_auditoria();

create index idx_clinica_practicas_servicio_clinica on clinica_practicas_servicio(clinica_id);

alter table clinica_practicas_servicio enable row level security;

create policy "clinica_practicas_servicio_select" on clinica_practicas_servicio
  for select to authenticated using (clinica_id = clinica_actual());

create policy "clinica_practicas_servicio_insert" on clinica_practicas_servicio
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and es_admin()
    -- La fila padre también debe ser de la clínica actual — sin esto, un
    -- id de servicio habilitado ajeno pasaría la FK (misma clase de IDOR
    -- ya corregida en tratamientos.cita_id).
    and exists (
      select 1 from clinica_servicios_habilitados s
      where s.id = servicio_habilitado_id and s.clinica_id = clinica_actual()
    )
  );

create policy "clinica_practicas_servicio_delete" on clinica_practicas_servicio
  for delete to authenticated using (clinica_id = clinica_actual() and es_admin());
