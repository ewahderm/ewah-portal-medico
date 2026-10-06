-- Datos básicos de la clínica: una clínica puede estar habilitada ante
-- REPS para más de un servicio de salud, cada uno con su propio código de
-- habilitación — clinicas.codigo_habilitacion (0052) es el código único
-- del PRESTADOR (12 dígitos), un concepto distinto que se queda intacto.
-- Esto agrega la lista de servicios habilitados, cada uno apuntando a la
-- "práctica médica" (el servicio de salud, en términos de REPS) que
-- representa.
--
-- El catálogo de prácticas médicas sí se siembra en esta migración (a
-- diferencia de CUPS, que quedó vacío hasta recibir el archivo oficial) —
-- el usuario pidió explícitamente que se investigara y validara contra la
-- fuente oficial. Se transcribió a mano, verificando dos veces contra el
-- texto plano extraído del PDF oficial descargado en vivo de
-- minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/DIJ/resolucion-3100-de-2019.pdf
-- (numeral 11, "GRUPO" y "SERVICIO DE..." de cada uno de los 5 grupos que
-- define esa resolución: Consulta Externa, Apoyo Diagnóstico y
-- Complementación Terapéutica, Internación, Quirúrgico, Atención
-- Inmediata) — nunca desde memoria/entrenamiento. La resolución NO incluye
-- una tabla de códigos numéricos universales por servicio (esos códigos
-- los asigna REPS al prestador en el momento de inscribirse, son propios
-- de cada clínica) — por eso codigo_habilitacion vive en la fila de
-- clinica_servicios_habilitados (lo escribe el administrador desde su
-- propio certificado REPS), nunca en practicas_medicas.
--
-- `codigo` de practicas_medicas se reutiliza a propósito como el nombre
-- del GRUPO REPS (no es un código numérico) — el motor genérico de
-- Parámetros ya selecciona/muestra código+nombre sin cambios, así esta
-- pestaña aparece agrupada visualmente sin escribir UI nueva.
create table practicas_medicas (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger practicas_medicas_set_updated_at
  before update on practicas_medicas
  for each row execute function set_updated_at();

alter table practicas_medicas enable row level security;

create policy "practicas_medicas_select" on practicas_medicas
  for select to authenticated using (true);

insert into practicas_medicas (codigo, nombre, orden) values
  ('Consulta Externa', 'Consulta Externa General', 1),
  ('Consulta Externa', 'Consulta Externa Especializada', 2),
  ('Consulta Externa', 'Vacunación', 3),
  ('Consulta Externa', 'Seguridad y Salud en el Trabajo', 4),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Terapias', 10),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Servicio Farmacéutico', 11),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Radiología Odontológica', 12),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Imágenes Diagnósticas — radiaciones ionizantes', 13),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Imágenes Diagnósticas — radiaciones no ionizantes', 14),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Medicina Nuclear', 15),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Radioterapia', 16),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Quimioterapia', 17),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Diagnóstico Vascular', 18),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Hemodinamia e Intervencionismo', 19),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Gestión Pre Transfusional', 20),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Toma de Muestras de Laboratorio Clínico', 21),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Laboratorio Clínico', 22),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Toma de Muestras de Cuello Uterino y Ginecológicas', 23),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Laboratorio de Citologías Cérvico-Uterinas', 24),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Laboratorio de Histotecnología', 25),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Patología', 26),
  ('Apoyo Diagnóstico y Complementación Terapéutica', 'Diálisis', 27),
  ('Internación', 'Hospitalización', 30),
  ('Internación', 'Hospitalización Paciente Crónico', 31),
  ('Internación', 'Cuidado Básico Neonatal', 32),
  ('Internación', 'Cuidado Intermedio Neonatal', 33),
  ('Internación', 'Cuidado Intensivo Neonatal', 34),
  ('Internación', 'Cuidado Intermedio Pediátrico', 35),
  ('Internación', 'Cuidado Intensivo Pediátrico', 36),
  ('Internación', 'Cuidado Intermedio Adulto', 37),
  ('Internación', 'Cuidado Intensivo Adultos', 38),
  ('Internación', 'Hospitalización en Salud Mental o Consumo de Sustancias Psicoactivas', 39),
  ('Internación', 'Hospitalización Parcial', 40),
  ('Internación', 'Cuidado Básico del Consumo de Sustancias Psicoactivas', 41),
  ('Quirúrgico', 'Cirugía', 50),
  ('Atención Inmediata', 'Urgencias', 60),
  ('Atención Inmediata', 'Transporte Asistencial', 61),
  ('Atención Inmediata', 'Atención Prehospitalaria', 62),
  ('Atención Inmediata', 'Atención del Parto', 63);

-- Lista de servicios habilitados por clínica — mismo criterio que
-- clinica_cups (0053): la presencia de la fila es la activación, pero acá
-- además lleva el código de habilitación propio de ESA clínica para ESE
-- servicio (no es un flag booleano puro).
create table clinica_servicios_habilitados (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  practica_medica_id uuid not null references practicas_medicas(id) on delete cascade,
  codigo_habilitacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references usuarios(id),
  unique (clinica_id, practica_medica_id)
);

create trigger clinica_servicios_habilitados_set_updated_at
  before update on clinica_servicios_habilitados
  for each row execute function set_updated_at();

create trigger clinica_servicios_habilitados_auditoria
  after insert or update or delete on clinica_servicios_habilitados
  for each row execute function fn_auditoria();

create index idx_clinica_servicios_habilitados_clinica on clinica_servicios_habilitados(clinica_id);

alter table clinica_servicios_habilitados enable row level security;

create policy "clinica_servicios_habilitados_select" on clinica_servicios_habilitados
  for select to authenticated using (clinica_id = clinica_actual());

-- Escritura restringida a administrador — mismo nivel que
-- fn_actualizar_datos_basicos_clinica (0052), del que esta lista es una
-- extensión directa en la misma pantalla/diálogo.
create policy "clinica_servicios_habilitados_insert" on clinica_servicios_habilitados
  for insert to authenticated with check (clinica_id = clinica_actual() and es_admin());

create policy "clinica_servicios_habilitados_update" on clinica_servicios_habilitados
  for update to authenticated using (clinica_id = clinica_actual() and es_admin())
  with check (clinica_id = clinica_actual());

create policy "clinica_servicios_habilitados_delete" on clinica_servicios_habilitados
  for delete to authenticated using (clinica_id = clinica_actual() and es_admin());
