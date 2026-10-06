-- Reemplazo completo del catálogo de servicios de salud (pedido del
-- usuario 2026-10-06, con su archivo "Checklist_Completo_Servicios_Res3100_2019"):
-- la jerarquía pasa a ser Grupo → Servicio (53 servicios), en vez de
-- Servicio REPS oficial (39, 0055) → Práctica (22, 0056). Decisión del
-- usuario por AskUserQuestion: su lista reemplaza todo, tal cual.
--
-- `practicas_medicas.codigo` sigue guardando el nombre del GRUPO (misma
-- convención de 0055), así el motor genérico de Parámetros los muestra
-- agrupados. Se agregan complejidad y requisitos (texto de referencia del
-- material del usuario, nunca validación).
--
-- El borrado es seguro: al aplicar esto no había ninguna fila en
-- clinica_servicios_habilitados, clinica_practicas_servicio ni
-- tipos_tratamiento.servicio_habilitado_id (verificado antes de escribirla).
-- El nivel de prácticas de 0056 deja de existir — sus dos tablas se
-- eliminan (estaban vacías de selecciones de clínicas).

drop table clinica_practicas_servicio;
drop table practicas_servicio;

alter table practicas_medicas
  add column complejidad text,
  add column requisitos text;

delete from practicas_medicas;

insert into practicas_medicas (codigo, nombre, complejidad, requisitos, orden) values
  ('Consulta Externa', 'Medicina General', 'Baja', 'Médico general con RETHUS. Dotación básica consultorio, historia clínica, lavado de manos.', 1),
  ('Consulta Externa', 'Enfermería', 'Baja', 'Enfermero/a profesional con RETHUS. Dotación para curaciones o control.', 2),
  ('Consulta Externa', 'Odontología General', 'Baja', 'Odontólogo con RETHUS. Unidad odontológica, esterilización, bioseguridad, Rx (si aplica).', 3),
  ('Consulta Externa', 'Nutrición y Dietética', 'Baja', 'Nutricionista con RETHUS. Báscula, tallímetro, cintas métricas, GPC.', 4),
  ('Consulta Externa', 'Psicología', 'Baja', 'Psicólogo con RETHUS. Privacidad acústica y visual.', 5),
  ('Consulta Externa', 'Optometría', 'Baja', 'Optómetra con RETHUS. Unidad oftalmológica/optométrica, caja de lentes, optotipos.', 6),
  ('Consulta Externa', 'Fisioterapia', 'Baja', 'Fisioterapeuta con RETHUS. Equipos de terapia física calibrados y con mantenimiento.', 7),
  ('Consulta Externa', 'Fonoaudiología y/o Terapia del Lenguaje', 'Baja', 'Fonoaudiólogo con RETHUS. Material didáctico, pruebas y protocolos de evaluación acústica.', 8),
  ('Consulta Externa', 'Terapia Ocupacional', 'Baja', 'Terapeuta ocupacional con RETHUS. Material de estimulación, pruebas neuromotoras.', 9),
  ('Consulta Externa', 'Terapia Respiratoria', 'Baja', 'Terapeuta respiratorio/Fisioterapeuta. Fonendoscopio, tensiómetro, flujómetro, oxímetro.', 10),
  ('Consulta Externa', 'Vacunación', 'Baja', 'Enfermero/a o auxiliar capacitado. Cadena de frío estricta, termohigrómetros, plantas de emergencia, PAI, jeringas, manejo de anafilaxia.', 11),
  ('Consulta Externa', 'Seguridad y Salud en el Trabajo', 'Baja/Media', 'Médico especialista en SST con licencia vigente. Equipos de medición, historia clínica ocupacional.', 12),
  ('Consulta Externa', 'Especialidades Médicas (Cardiología, Neumología, Pediatría, Medicina Interna, Dermatología, Neurología, etc.)', 'Media/Alta', 'Médico especialista con RETHUS. GPC, dotación específica según especialidad.', 13),
  ('Consulta Externa', 'Especialidades Quirúrgicas (Cirugía General, Ortopedia, Urología, Cirugía Plástica, etc.)', 'Media/Alta', 'Médico especialista quirúrgico. Insumos para retiro de puntos, curaciones o valoraciones pre/post quirúrgicas.', 14),
  ('Consulta Externa', 'Especialidades Odontológicas (Ortodoncia, Endodoncia, Periodoncia, Cirugía Maxilofacial, etc.)', 'Media/Alta', 'Odontólogo especialista. Equipamiento específico por especialidad odontológica.', 15),
  ('Consulta Externa', 'Dolor y Cuidados Paliativos', 'Media/Alta', 'Médico especialista o con entrenamiento certificado en cuidados paliativos. Recetarios oficiales de medicamentos de control.', 16),

  ('Apoyo Diagnóstico', 'Toma de Muestras de Laboratorio Clínico', 'Baja', 'Auxiliar de enfermería / laboratorio certificado. Insumos de venopunción, cadena de frío, transporte de muestras.', 20),
  ('Apoyo Diagnóstico', 'Laboratorio Clínico', 'Baja/Media/Alta', 'Bacteriólogo. Controles de calidad internos y externos, calibración de equipos, reactivos vigentes, neveras.', 21),
  ('Apoyo Diagnóstico', 'Toma de Muestras de Cuello Uterino y Ginecológicas', 'Baja', 'Personal entrenado. Camilla ginecológica, espéculos, láminas, fijadores, iluminación adecuada.', 22),
  ('Apoyo Diagnóstico', 'Laboratorio de Citologías Cérvico-uterinas', 'Media', 'Citohistotecnólogo o Patólogo. Microscopios calibrados, colorantes, control de calidad de lectura.', 23),
  ('Apoyo Diagnóstico', 'Servicio de Histotecnología', 'Media', 'Histotecnólogo. Equipos de procesamiento de tejidos, micrótomos, tinciones, manejo de formaldehído.', 24),
  ('Apoyo Diagnóstico', 'Patología', 'Alta', 'Médico Patólogo. Microscopio, macroscopía, archivo de bloques y láminas, control de reactivos.', 25),
  ('Apoyo Diagnóstico', 'Radiología Odontológica', 'Baja/Media', 'Odontólogo / Auxiliar Rx. Equipo Rx periapical/panorámico. Licencia de práctica, dosimetría, blindaje.', 26),
  ('Apoyo Diagnóstico', 'Imágenes Diagnósticas (No Ionizantes - Ecografía, RM)', 'Media/Alta', 'Médico radiólogo / Especialista entrenado. Equipos con registro INVIMA, mantenimiento, informes.', 27),
  ('Apoyo Diagnóstico', 'Imágenes Diagnósticas (Ionizantes - Rx, TAC, Mamografía)', 'Media/Alta', 'Radiólogo, Tecnólogo Rx. Licencia de radioprotección, plomado, dosímetros, control de calidad del haz.', 28),
  ('Apoyo Diagnóstico', 'Medicina Nuclear', 'Alta', 'Médico nuclear, Radiofarmaceuta. Licencia de material radiactivo, gestión de desechos radiactivos, gammacámaras/PET.', 29),
  ('Apoyo Diagnóstico', 'Radioterapia', 'Alta', 'Oncólogo radioterápico, Físico médico. Acelerador lineal, braquiterapia, licencias nucleares muy estrictas.', 30),
  ('Apoyo Diagnóstico', 'Quimioterapia', 'Alta', 'Oncólogo clínico, Hematólogo, Enfermero oncólogo. Cabina de flujo laminar, protocolo de derrames de citostáticos.', 31),
  ('Apoyo Diagnóstico', 'Diagnóstico Vascular', 'Media', 'Médico especialista. Equipos Doppler, pletismografía, camilla basculante.', 32),
  ('Apoyo Diagnóstico', 'Hemodinamia e Intervencionismo', 'Alta', 'Hemodinamista, Enfermero/a, Tecnólogo Rx. Angiógrafo, carro de paros, blindaje, insumos endovasculares.', 33),
  ('Apoyo Diagnóstico', 'Gestión Pre-transfusional', 'Media', 'Bacteriólogo / Médico. Nevera exclusiva de sangre, termógrafo, pruebas de compatibilidad, convenio con Banco de Sangre.', 34),
  ('Apoyo Diagnóstico', 'Diálisis (Hemodiálisis y Peritoneal)', 'Alta', 'Nefrólogo, Enfermero/a especialista. Planta de tratamiento de agua tratada, máquinas de diálisis, carro de paros, sillones reclinables.', 35),
  ('Apoyo Diagnóstico', 'Servicio Farmacéutico', 'Baja/Media/Alta', 'Químico Farmacéutico (Media/Alta) / Regente (Baja). Áreas de recepción, almacenamiento, dispensación, termohigrómetros, medicamentos de control.', 36),

  ('Internación', 'Hospitalización General Adultos', 'Baja/Media/Alta', 'Médico, Enfermero/a, Auxiliares (24/7). Camas hospitalarias, llamado de enfermería, oxígeno, carro de paros.', 40),
  ('Internación', 'Hospitalización General Pediátrica', 'Baja/Media/Alta', 'Pediatra, Médico, Enfermero/a. Cunas con barandas, área de juegos, medidas antropométricas pediátricas.', 41),
  ('Internación', 'Obstetricia', 'Baja/Media/Alta', 'Ginecobstetra / Médico. Monitoría fetal, ecógrafo, atención materno-perinatal, protocolo código rojo.', 42),
  ('Internación', 'Cuidado Intermedio (Adultos, Pediátrico, Neonatal)', 'Media/Alta', 'Médico intensivista/especialista, Enfermeros. Monitoreo continuo, gases medicinales, bombas de infusión (microgoteo en neo).', 43),
  ('Internación', 'Cuidado Intensivo (UCI Adultos, UCI Pediátrica, UCI Neonatal)', 'Alta', 'Médico intensivista (24/7). Ventiladores mecánicos (1 por cama), monitorización invasiva, marcapasos, interdependencia total (Laboratorio, Rx, Banco de Sangre 24/7).', 44),
  ('Internación', 'Unidad de Quemados (Adultos y Pediátrica)', 'Alta', 'Cirujano plástico, Intensivista. Áreas de aislamiento estricto, balneoterapia, quirófano propio o interdependiente.', 45),
  ('Internación', 'Psiquiatría o Unidad de Salud Mental', 'Baja/Media', 'Psiquiatra, Psicólogo, T.O. Habitaciones y baños sin elementos punzocortantes ni puntos de anclaje (riesgo suicida).', 46),
  ('Internación', 'Cuidado Agudo en Salud Mental o Psiquiatría', 'Alta', 'Psiquiatra (24/7). Áreas de contención, protocolos de sedación y sujeción mecánica/farmacológica.', 47),
  ('Internación', 'Atención Institucional de Paciente Crónico (con/sin ventilador)', 'Media/Alta', 'Médico, Enfermero/a, Terapeuta. Camas hospitalarias, prevención de úlceras por presión, ventiladores de cuidado prolongado (si aplica).', 48),
  ('Internación', 'Atención a Consumidor de Sustancias Psicoactivas', 'Baja/Media', 'Psiquiatra, Toxicólogo, Psicólogo. Protocolos de desintoxicación, abstinencia, áreas seguras.', 49),
  ('Internación', 'Internación Parcial (Hospital de Día)', 'Baja/Media', 'Equipo multidisciplinario. Área de descanso temporal, comedor, salas de terapia grupal o infusión.', 50),

  ('Quirúrgico', 'Cirugía General / Especializada', 'Media/Alta', 'Cirujanos, Anestesiólogo, Instrumentador. Salas de cirugía normativas, recubrimientos epóxicos, gases centrales, lámparas cialíticas, mesas quirúrgicas, esterilización.', 60),
  ('Quirúrgico', 'Cirugía Ambulatoria', 'Baja/Media', 'Cirujano, Anestesiólogo. Área de recuperación (RPA), criterios claros de alta, carro de paros.', 61),
  ('Quirúrgico', 'Trasplantes (Renal, Hígado, Corazón, Médula, etc.)', 'Alta', 'Cirujano de trasplantes, Inmunólogo. Aprobación Red de Donación y Trasplantes, laboratorios de histocompatibilidad, UCI.', 62),

  ('Atención Inmediata', 'Urgencias (Baja, Media, Alta Complejidad)', 'Baja/Media/Alta', 'Médico presencial 24/7, Enfermero/a, Auxiliares (BLS/ACLS/Violencia sexual). Triage, reanimación, observación, consultorios, interdependencia Rx y Lab.', 70),
  ('Atención Inmediata', 'Atención del Parto', 'Baja/Media', 'Médico, Enfermero/a (Entrenamiento código rojo). Salas TPR (Trabajo de parto, Parto, Recuperación), incubadora de transporte, atención del recién nacido.', 71),
  ('Atención Inmediata', 'Transporte Asistencial Básico (TAB)', 'Baja', 'Conductor primeros auxilios, Auxiliar/APH (BLS). Ambulancia certificada (SOAT, tecno), camilla, oxígeno, botiquín, succión.', 72),
  ('Atención Inmediata', 'Transporte Asistencial Medicalizado (TAM)', 'Alta', 'Médico (ACLS), Auxiliar/APH. Monitor desfibrilador, ventilador de transporte, medicamentos de paro e infusión.', 73),
  ('Atención Inmediata', 'Atención Prehospitalaria', 'Baja/Media', 'Tecnólogos APH. Dotación para atención de traumas o emergencias en la calle, inmovilizadores, comunicación con centro regulador (CRUE).', 74);
