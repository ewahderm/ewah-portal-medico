# Requerimiento funcional: módulo de Habilitación (Res. 3100/2019)

Autor: director-proyecto · Fecha: 2026-10-06 · Estado: **borrador para validar con el usuario** (ver §8, decisiones abiertas)
Destinatario siguiente: `lider-tecnico` (traduce esto a requerimiento técnico), luego `planeacion` / arquitectura.

Insumos verificados contra fuente oficial (carpeta `scratchpad/habilitacion/`):
`inscripcion.json` (37 documentos, 16 pasos, autoevaluación, 40 novedades, enlaces), `criterios.json` (3.975 criterios del numeral 11), `mapeo-servicios.json` (52 servicios del catálogo → numeral), `reportes.json` (17 obligaciones de reporte).
Código revisado: `0055/0058` (servicios habilitados), `0052` (datos básicos), `0048` (RRHH: `empleados`, `documentos_empleado`, `documentos_normativos` con `categoria='habilitacion'` ya prevista), `0035/0036` (Medio Ambiente), `0011` (sedes), `lib/modulos/registro.ts`, cron `alertas-rrhh`.

Convención del documento: **[U]** = lo pidió el usuario · **[D]** = lo agrego yo por norma o por buena práctica (con su sustento).

---

## 0. Correcciones y enriquecimientos al pedido (leer primero)

Antes del detalle, cinco cosas del pedido que hay que ajustar porque, tal como se dijeron, llevarían a construir algo que falla frente a la norma:

1. **Los FT001, FT002… no los pide SISPRO: los pide la Superintendencia Nacional de Salud.** Son "Archivos Tipo" de la Circular Única 047/2007 de Supersalud (reformulados por la CE 2024151000000007-5) y se cargan en el aplicativo **nRVCC** (`https://nrvcc.supersalud.gov.co/`). Lo que va por SISPRO/PISIS (MinSalud) es otra cosa: RIPS, Res. 256/2016 (indicadores de calidad), Res. 202/2021 (PEDT). El calendario debe mostrar a qué entidad y a qué plataforma va cada reporte, o el administrador lo buscará en el lugar equivocado.
2. **Qué reportes debe presentar cada prestador depende de su tipo y de su "grupo" Supersalud.** Un profesional independiente no presenta FT. Una IPS pequeña (grupo D2 o D3) presenta FT001/FT003/FT004/FT025 cada semestre (20-feb y 20-jul) pero no presenta FT006/FT009/FT018. Si el sistema no conoce el grupo, el calendario sale mal. El grupo lo define la CE 20211700000005-5 de 2021 y la IPS debe revisarlo cada año.
3. **La suficiencia patrimonial solo aplica a IPS y a transporte especial de pacientes** (Res. 544/2023, art. 3.2). Al profesional independiente no se le pide, y tampoco existencia y representación legal, RUT ni licencia de construcción. El checklist de documentos se genera según el tipo de prestador; nunca es una lista fija.
4. **En el REPS los servicios se habilitan por sede, con complejidad y modalidad.** Hoy `clinica_servicios_habilitados` guarda solo "la clínica tiene este servicio" con su código. Sin sede, complejidad y modalidad (intramural, extramural, telemedicina) no se puede saber qué criterios de los 3.975 le aplican. Esto es la base del filtro (§4) y es la decisión abierta n.º 1.
5. **La autoevaluación no es un documento que se adjunta una vez.** Es un trámite **periódico y obligatorio**: antes de inscribirse, durante el 4.º año de la inscripción inicial y después **cada año antes del vencimiento** (arts. 5, 10 y 11). Si no se hace, el REPS inactiva los servicios o al prestador entero. Es la fecha más crítica de todo el calendario y el pedido no la menciona.

Además: **EWAH no radica nada ante el Estado.** El REPS, el nRVCC y PISIS no ofrecen API pública para prestadores. El módulo prepara, verifica, recuerda y guarda la evidencia ("presentado el X, radicado N.º Y, acuse adjunto"). La carga oficial la hace el usuario en cada portal, usando el enlace y el instructivo que le mostramos. Hay que decirlo en la interfaz para no generar falsa seguridad.

---

## 1. Visión y flujo del usuario

### 1.1 Visión

Que el administrador de un consultorio, de una IPS o un profesional independiente, **sin saber de normativa**, pueda:
(a) inscribirse en el REPS con todos los soportes correctos la primera vez,
(b) saber en todo momento si cumple los criterios de la Res. 3100 que le aplican a **sus** servicios, y qué le falta,
(c) no vencerse nunca en una autoevaluación, un reporte a Supersalud o un documento.

Además, que ante una visita de verificación de la secretaría pueda abrir la evidencia de cada criterio en un clic.

Principio de diseño: **el sistema decide qué aplica; el usuario solo responde lo que le corresponde.** Nunca se le muestran 3.975 criterios. Por ejemplo, un consultorio de dermatología intramural sin telemedicina ve unos 400.

### 1.2 Flujo en 6 etapas (la "Ruta de habilitación")

La página de inicio del módulo es el **Tablero**, con una barra de progreso de 6 pasos arriba. Cada paso muestra su estado (pendiente, en curso, completo o con alerta) y lleva a su pantalla. El orden importa: cada paso alimenta el siguiente.

```
1. Perfil del prestador ──► 2. Sedes y servicios ──► 3. Documentos de inscripción
        │                         │                          │
        │ (tipo, grupo,           │ (qué criterios           │ (qué soportes
        │  fechas REPS)           │  aplican)                │  aplican)
        ▼                         ▼                          ▼
5. Obligaciones y calendario ◄── 4. Autoevaluación por estándar (+ plan de mejora)
        │
        ▼
6. Tablero de cumplimiento y alertas  (resumen permanente; es la página de inicio)
```

| Paso | Pregunta que responde al usuario | Qué produce |
|---|---|---|
| 1. Perfil del prestador | "¿Qué tipo de prestador soy y ante quién respondo?" | Tipo de prestador, naturaleza jurídica, grupo Supersalud, secretaría de salud, fechas REPS. Con esto se calculan los documentos y los reportes que aplican. |
| 2. Sedes y servicios | "¿Qué voy a prestar y dónde?" | Servicio × sede × complejidad × modalidades (y rol de telemedicina). Con esto se filtran los criterios. |
| 3. Documentos de inscripción | "¿Qué tengo que radicar ante la secretaría?" | Checklist de soportes con archivo, estado y vigencia, más el seguimiento del trámite (radicado, código, visita, constancia). |
| 4. Autoevaluación | "¿Cumplo cada criterio?" | Cumple / No cumple / No aplica, con evidencia, por estándar y por servicio. Lo que no se cumple genera un plan de mejora. Se cierra como "Autoevaluación [año]". |
| 5. Obligaciones y calendario | "¿Qué tengo que presentar y cuándo?" | Reportes que aplican con explicación y enlace oficial, fechas límite generadas automáticamente y un calendario visual igual al de Agenda. |
| 6. Tablero | "¿Cómo voy y qué es urgente?" | % de cumplimiento, servicios listos o no aptos para declarar, documentos vencidos, semáforo de próximas obligaciones. |

Dos modos de uso que el flujo debe cubrir **[D]**:
- **Prestador nuevo** (no inscrito): recorre los pasos 1→4 y radica. El paso 3 incluye el seguimiento del trámite hasta la constancia de habilitación.
- **Prestador ya habilitado** (caso de EWAH): en el paso 1 registra su código y sus fechas REPS existentes, en el paso 3 solo sube lo que quiera conservar como evidencia, y su trabajo principal está en los pasos 4 y 5: mantenerse en cumplimiento y renovar a tiempo. El asistente pregunta al inicio "¿Ya estás inscrito en el REPS?" y adapta los textos.

### 1.3 Estructura de pantallas (para arquitectura-frontend)

Ruta `/habilitacion` con subnavegación (pestañas en escritorio, menú desplegable en móvil):
`Resumen` (tablero + ruta) · `Perfil` · `Sedes y servicios` · `Documentos` · `Autoevaluación` · `Calendario` · `Obligaciones` (configuración).

- Entrada en `REGISTRO_MODULOS` (regla permanente del proyecto) y en `NAV_GROUPS` → grupo **Administración**.
- Patrones existentes que se reusan: diálogos estándar (50 % de ancho, solo se cierran con X), Combobox buscable, `FileInput`, toasts, paginación de 20, exportar xlsx (solo administrador), calendario `react-big-calendar` de `citas/`.
- Pantalla de autoevaluación **[D, UX]**: lista agrupada por los **7 estándares**, en este orden: Talento humano, Infraestructura, Dotación, Medicamentos/dispositivos/insumos, Procesos prioritarios, Historia clínica y registros, Interdependencia. Cada criterio es una tarjeta con el texto literal de la norma, la cita (numeral y página) y tres botones grandes: Cumple / No cumple / No aplica. Las evidencias sugeridas de otros módulos aparecen en la misma tarjeta. Filtros: servicio, sede, estado (pendientes primero) y "solo los míos" (responsable). Los criterios padre de tipo "Cuenta con:" se muestran como encabezado plegable: su estado sale de sus hijos y no se marcan a mano.

---

## 2. Historias de usuario por etapa

Roles: **Administrador** (de la clínica o el profesional independiente), **Responsable de calidad** (rol con permiso de habilitación sin ser administrador), **Gerencia** (solo lectura del tablero), **Profesional** (puede ser responsable de criterios de su servicio).

### Etapa 1 — Perfil regulatorio del prestador

**HU-1.1 [U+D]** Como administrador, quiero declarar el tipo de prestador (IPS, profesional independiente, transporte especial de pacientes, entidad con objeto social diferente) y su naturaleza jurídica (persona natural o jurídica; privada, pública o mixta), para que el sistema solo me pida los documentos y reportes que me aplican.
- AC1: El tipo de prestador es obligatorio para entrar a los pasos 2 a 5. Sin él, el tablero muestra "Completa tu perfil para ver tu ruta".
- AC2: Al cambiar el tipo, el checklist de documentos (paso 3) y las obligaciones (paso 5) se recalculan. Lo ya cargado no se borra: queda marcado "ya no aplica a tu tipo de prestador".
- AC3: Tipo de persona y NIT se toman de Datos básicos (0052); no se capturan dos veces.

**HU-1.2 [D]** Como administrador de una IPS, quiero indicar mi grupo de clasificación Supersalud (B, C1, C2, D1, D2, D3) con ayuda de un asistente, para que las fechas de los FT sean las que me corresponden.
- AC1: Un asistente de preguntas (¿tu NIT es el de una EPS? ¿aplicas NIIF Grupo 1, 2 o 3? ¿activos, ingresos o patrimonio en UVT? ¿cuántos servicios de alta o mediana complejidad?) **sugiere** un grupo con los umbrales literales de la CE 20211700000005-5. El usuario confirma o corrige. El valor guardado es el que confirma el usuario, no el sugerido.
- AC2: Se guarda la fecha de la clasificación. Cada año, después del 31 de diciembre, aparece una alerta "Verifica tu grupo Supersalud", porque la circular exige revisarlo anualmente.
- AC3: Para un profesional independiente este campo no aparece.

**HU-1.3 [U+D]** Como administrador, quiero registrar mi situación ante el REPS (no inscrito / en trámite / inscrito), el código del prestador, la fecha de inscripción y la fecha de vencimiento de la inscripción o renovación, para que el sistema me avise antes de la autoevaluación obligatoria.
- AC1: Si el estado es "inscrito", la fecha de vencimiento es obligatoria. El sistema la **sugiere** (inscripción inicial + 4 años; luego +1 año por renovación), pero manda la que el usuario copia del REPS, con el texto de ayuda "cópiala tal como aparece en el REPS".
- AC2: Con esa fecha se genera automáticamente la obligación "Autoevaluación y renovación REPS" (paso 5).
- AC3: El código del prestador se lee y escribe en el mismo campo `clinicas.codigo_habilitacion` (0052); no hay campo nuevo.

**HU-1.4 [D]** Como administrador, quiero indicar la secretaría de salud (departamental o distrital) ante la que estoy inscrito, para que los enlaces al REPS me lleven al portal correcto.
- AC1: Se deriva del departamento de Datos básicos y se puede corregir (las secretarías distritales no siempre coinciden con el departamento).
- AC2: Si el código territorial (`ets_codigo`) de esa secretaría no está verificado (hoy solo está verificado Bogotá = 11), se muestra el portal nacional `https://prestadores.minsalud.gov.co/habilitacion/` con la nota "busca el enlace de tu secretaría".

### Etapa 2 — Sedes y servicios a habilitar

**HU-2.1 [D]** Como administrador, quiero completar por cada sede los datos de la edificación que pide la norma (uso exclusivo en salud o mixto; año de construcción o de la última ampliación o remodelación), para que el sistema sepa qué criterios de infraestructura y qué documentos (licencia de construcción, RETIE, permiso de propiedad horizontal, vulnerabilidad estructural) me aplican.
- AC1: Los bloques de 11.1 Infraestructura "Edificaciones de uso exclusivo" y "de uso mixto" se filtran según este dato.
- AC2: El año de construcción activa reglas de documentos: antes de mayo de 2005 (RETIE con plan de ajustes); antes del 2-dic-1996 (licencia o documento de reconocimiento, regla de la Res. 544/465); antes de 2010 con urgencias, cirugía o UCI (estudio de vulnerabilidad y plan de reforzamiento).
- AC3: Las sedes siguen siendo las de Parámetros (0011); no hay un segundo maestro de sedes.

**HU-2.2 [U+D]** Como administrador, quiero declarar por cada sede qué servicios presto, con su complejidad y sus modalidades (intramural; extramural unidad móvil, jornada de salud o domiciliaria; telemedicina con categoría y rol), para ver solo los criterios que me corresponden.
- AC1: Solo se ofrecen las complejidades y modalidades que la norma prevé para ese servicio (p. ej. 11.2.2 Consulta especializada solo ofrece complejidad mediana; 11.5.1 Cirugía, mediana o alta).
- AC2: Al guardar, se muestra "Este servicio te agrega N criterios" y el total aplicable de la clínica.
- AC3: El servicio sale del catálogo de 52 (`practicas_medicas`, 0058), y el código de habilitación del servicio sigue siendo el de la fila existente (`clinica_servicios_habilitados`).
- AC4: Un servicio con mapeo a varios numerales (p. ej. "Cuidado intermedio (adultos, pediátrico, neonatal)") obliga a escoger cuál o cuáles se prestan. Ver decisión D2.

**HU-2.3 [D]** Como administrador, quiero que el sistema me advierta cuando un servicio no se puede habilitar todavía (p. ej. tiene un criterio "No cumple"), porque la norma dice que si en la autoevaluación detecto un incumplimiento debo abstenerme de declararlo, ofertarlo y prestarlo (art. 5).
- AC1: Cada servicio por sede muestra un estado: "Listo para declarar", "Con incumplimientos (N)" o "Sin evaluar (N pendientes)".
- AC2: El estado es informativo. No bloquea otros módulos en esta entrega (ver §7).

### Etapa 3 — Documentos de inscripción y trámite

**HU-3.1 [U]** Como administrador, quiero un checklist de los documentos de inscripción que me aplican según mi tipo de prestador y mis condiciones (sedes, servicios, telemedicina, radiaciones ionizantes, vehículos), para adjuntar cada uno y saber qué me falta.
- AC1: El checklist se genera del catálogo de 35 documentos verificados (`inscripcion.json`), con `aplica_a` y la condición. Dos documentos no verificados (póliza de responsabilidad civil y RUT del profesional independiente) **no** aparecen como requisito, porque el art. 18 prohíbe exigir requisitos fuera de la norma. Pueden subirse como "documento adicional".
- AC2: Cada documento muestra su nombre, la explicación en lenguaje sencillo, la cita normativa con enlace al PDF oficial, el estado (Pendiente / Cargado / Vencido / No aplica con justificación) y su archivo o archivos.
- AC3: Ejemplo, IPS persona jurídica: certificado de existencia y representación legal, cédula del representante legal, NIT, RUT, certificación de suficiencia patrimonial con la tarjeta profesional del contador o revisor fiscal, licencia de construcción, certificado de seguridad de la edificación, plan hospitalario de emergencias, plan de mantenimiento de la planta física, RETIE, formulario REPS y una declaración de autoevaluación por servicio. Para un profesional independiente: solo cédula, títulos, tarjeta profesional o ReTHUS, RETIE, formulario y declaración.
- AC4: Los documentos que la norma describe como condición verificable pero que no están en la lista de radicación (estados financieros, cuenta bancaria y libros de una IPS nueva) aparecen en una sección aparte, "Evidencia que te pueden pedir en la visita", y no cuentan como faltantes para radicar.

**HU-3.2 [D]** Como administrador, quiero que el certificado de existencia y representación legal me avise si tendrá más de 30 días el día que planeo radicar, porque la norma exige que no supere 30 días a la fecha de radicación.
- AC1: La vigencia de este documento se calcula contra la "fecha planeada de radicación" del trámite, no contra hoy. Sin fecha planeada, se calcula contra hoy.
- AC2: Los demás documentos con vencimiento (RETIE, revisión técnico-mecánica, licencia de radiaciones) usan la fecha de vencimiento que digita el usuario.

**HU-3.3 [U+D]** Como administrador de una IPS, quiero registrar los datos de suficiencia patrimonial y ver si cumplo los 3 indicadores antes de radicar.
- AC1: Una calculadora informativa con 5 cifras del año anterior (patrimonio total, capital, obligaciones mercantiles vencidas a más de 360 días, obligaciones laborales vencidas a más de 360 días, pasivo corriente) muestra: patrimonio/capital > 50 %, mercantiles/pasivo corriente ≤ 50 %, laborales/pasivo corriente ≤ 50 %, en verde o rojo (Manual 8.2).
- AC2: Las cifras quedan guardadas con su fecha de corte, junto a la certificación firmada que se adjunta. La calculadora no reemplaza la certificación del contador o revisor fiscal.
- AC3: Solo es visible para IPS y transporte especial.

**HU-3.4 [D]** Como administrador, quiero registrar el avance del trámite ante la secretaría (radicado, devolución con inconsistencias, código asignado, visita previa programada o realizada, constancia de habilitación, distintivos por servicio), para tener la trazabilidad completa.
- AC1: Línea de tiempo con los pasos 8 a 15 del procedimiento (`inscripcion.json`, pasos). Cada hito tiene fecha, observación y adjunto opcional (radicado, acta de visita, constancia).
- AC2: Si la visita encuentra incumplimientos subsanables, se crea una obligación con plazo de **8 días hábiles** desde la fecha del acta.
- AC3: Al registrar la constancia, el perfil pasa a "Inscrito" y se pide la fecha de vencimiento (HU-1.3).

**HU-3.5 [D]** Como administrador, quiero que un documento reemplazado conserve su versión anterior, para demostrar qué tenía vigente en cada fecha.
- AC1: Subir un archivo nuevo a un documento crea una versión nueva. La anterior queda visible en el historial y no se borra (mismo principio que `documentos_normativos`).

### Etapa 4 — Autoevaluación por estándar

**HU-4.1 [U]** Como responsable de calidad, quiero ver solo los criterios que aplican a mis servicios, sedes, complejidad y modalidades, agrupados por los 7 estándares, para evaluarlos uno por uno.
- AC1: El conjunto mostrado sale del algoritmo de §4. Contadores por estándar ("Talento humano 12/31").
- AC2: Cada criterio muestra el texto literal, el numeral, la página de la Res. 3100 y un enlace al PDF oficial.
- AC3: Los criterios con `nota_vigencia` llevan una insignia (p. ej. "Deja de exigirse el 3-ene-2027, Res. 914/2025"). Ver D4.

**HU-4.2 [U]** Como responsable de calidad, quiero marcar cada criterio como Cumple, No cumple o No aplica, para tener el estado real de cumplimiento.
- AC1: "No aplica" exige una justificación escrita (mínimo 10 caracteres). Muchos criterios de 11.1 mencionan dentro del texto los servicios a los que aplican (p. ej. "servicios de urgencias, atención del parto…"); la norma deja esa identificación al prestador.
- AC2: "Cumple" exige al menos una evidencia: archivo, documento normativo, registro de otro módulo o nota. Configurable a nivel de clínica: "exigir evidencia para marcar Cumple" (sí por defecto).
- AC3: "No cumple" abre directamente el formulario de plan de mejora (HU-4.5).
- AC4: Cada cambio de estado guarda quién, cuándo, el estado anterior y el nuevo. La historia no se edita ni se borra.
- AC5: Los criterios padre de tipo encabezado ("Cuenta con:") no se marcan: muestran "N de M hijos cumplen".
- AC6: Los criterios que solo remiten a 11.1 ("Cumple con los criterios que le sean aplicables de todos los servicios", 547 casos) se muestran en gris como "Se cumple con 11.1" y toman el estado agregado del estándar equivalente de 11.1. No piden un clic.

**HU-4.3 [D]** Como responsable de calidad, quiero que un criterio de 11.1 (aplicable a todos los servicios) se evalúe una sola vez por sede y no una vez por cada servicio, para no repetir el mismo trabajo.
- AC1: Los criterios de 11.1 se evalúan por **sede**. Los de un servicio específico se evalúan por **servicio × sede**.
- AC2: Un criterio de un servicio que remite a otro (41 casos, p. ej. 11.2.2.TH.1 "Cumple con los criterios definidos para el servicio de consulta externa general") incluye automáticamente los criterios del servicio referido (ver §4, paso 4).

**HU-4.4 [U+D]** Como responsable de calidad, quiero asignar un responsable y una fecha de verificación a cada criterio, para repartir el trabajo entre el equipo.
- AC1: El responsable es un usuario de la clínica. Filtro "asignados a mí".
- AC2: Una evaluación con más de 12 meses desde su última verificación se marca "Re-verificar". La autoevaluación es anual (art. 10).

**HU-4.5 [D]** Como responsable de calidad, quiero que cada "No cumple" tenga una acción de mejora con responsable y fecha compromiso, para cerrar la brecha antes de declarar.
- AC1: Plan de mejora: acción, responsable, fecha compromiso, estado (abierta / en curso / cerrada) y evidencia de cierre.
- AC2: La fecha compromiso aparece en el calendario del paso 5 como evento tipo "Plan de mejora".
- AC3: Cerrar el plan no cambia el criterio a "Cumple" por sí solo; el sistema sugiere re-evaluar.

**HU-4.6 [D]** Como administrador, quiero "cerrar" una autoevaluación con fecha (p. ej. "Autoevaluación 2027 — renovación REPS"), para tener una foto inmutable de lo que declaré ante la secretaría.
- AC1: Al cerrar se congela una instantánea con todos los criterios aplicables, su estado, la evidencia vinculada y el usuario que cierra. Requiere un permiso especial (APPROVE).
- AC2: Si hay criterios "No cumple" o pendientes en un servicio, el sistema advierte "no deberías declarar este servicio" y obliga a confirmarlo de forma explícita, listando los servicios afectados.
- AC3: Se puede exportar a xlsx y PDF (servicio → estándar → criterio → estado → evidencia) para la visita de verificación.
- AC4: Cerrar la autoevaluación marca como cumplida la ocurrencia "Autoevaluación REPS" de ese año en el calendario, junto con la fecha en que el usuario la declaró en el REPS (dato que digita él).

**HU-4.7 [D]** Como profesional de la salud, quiero ver qué criterios de talento humano dependen de mis documentos en RRHH, para mantenerlos al día.
- AC1: Ver §5. Los criterios de 11.1 TH (títulos, ReTHUS o tarjeta profesional, vacunación…) muestran por cada persona asociada al servicio si tiene el documento en RRHH y si está vigente.

### Etapa 5 — Obligaciones de reporte y calendario

**HU-5.1 [U]** Como administrador, quiero ver la lista de reportes que debo presentar a secretarías, Supersalud y MinSalud, cada uno con una explicación corta y el enlace al sitio oficial con las instrucciones de registro y cargue.
- AC1: El catálogo global tiene, por obligación: código, nombre, entidad, plataforma con su URL, explicación en lenguaje sencillo, norma con artículo y URL, URL del instructivo, periodicidad, regla de fecha, a qué tipos y grupos aplica, y la marca "verificado".
- AC2: Las obligaciones con `verificado=false` (hoy ST002 PAMEC y SIVIGILA) se muestran con la insignia "Por confirmar con tu asesor" y **no** generan alertas rojas hasta que el usuario las active.
- AC3: Se activan automáticamente las que aplican según tipo de prestador y grupo. El usuario puede desactivar una con justificación (p. ej. "FT025: no facturamos a aseguradoras; confirmado con Supersalud el …") o activar una que el sistema no propuso.
- AC4: Cada enlace se muestra con la fecha en que se verificó por última vez ("enlace verificado el 06-oct-2026").

**HU-5.2 [U]** Como administrador, quiero un calendario visual, igual al de la Agenda, con todas las fechas límite de mis obligaciones, para planear el trabajo del contador y del equipo.
- AC1: Mismo componente y mismas vistas (mes, semana, agenda) que `citas/`. Los eventos son: ocurrencias de reportes, vencimiento de la inscripción REPS (autoevaluación), vencimiento de documentos, compromisos del plan de mejora y verificación anual del grupo Supersalud.
- AC2: Color por semáforo (no por tipo): rojo = vencido o ≤ 7 días; ámbar = 8 a 30 días; verde = > 30 días; gris = presentado. Un ícono indica el tipo (reporte, documento, autoevaluación, plan de mejora). Es la misma lección que ya se aprendió en la Agenda (color = una sola dimensión, ícono = la otra).
- AC3: Al hacer clic se abre el detalle: explicación, entidad, plataforma con enlace, instructivo con enlace, periodo que cubre (p. ej. "corte 31-dic-2026") y el botón "Marcar como presentado".
- AC4: Las ocurrencias se generan solas para los próximos 18 meses a partir de la regla de fecha y del grupo. Si cambia el grupo, se regeneran las que no se hayan presentado.

**HU-5.3 [D]** Como administrador, quiero marcar un reporte como presentado con la fecha real, el número de radicado o acuse y el archivo enviado, para tener prueba ante una auditoría de Supersalud.
- AC1: Estados de cada ocurrencia: Pendiente → Presentado (con fecha, radicado y adjunto) | No aplica en este periodo (con justificación) | Vencido (automático si pasa la fecha sin presentar).
- AC2: Si se presenta después de la fecha límite, queda marcado "presentado extemporáneo". El dato no se oculta.
- AC3: Una ocurrencia presentada no se edita: se anula y se registra de nuevo (append-only, igual que Tratamientos).

**HU-5.4 [U+D]** Como administrador, quiero recibir alertas por correo y en el sistema cuando se acerca una fecha límite, para no depender de entrar al módulo.
- AC1: Avisos por defecto: 30, 15, 7 y 1 día antes, y el día del vencimiento. La autoevaluación REPS avisa además 90 y 60 días antes, porque requiere evaluar todos los criterios. Cada obligación puede tener sus propios días de aviso.
- AC2: Envío diario por cron (mismo patrón que `/api/cron/alertas-rrhh`) a los usuarios con permiso de habilitación, agrupado en un solo correo por clínica y por día.
- AC3: Si la fecha cae en sábado, domingo o festivo, la alerta lo dice: "cae en día no hábil; preséntalo antes". Ver D5.

**HU-5.5 [D]** Como administrador, quiero registrar una novedad del REPS (apertura o cierre de servicio, cambio de sede, cambio de representante legal…) y que el sistema me diga qué implica, para no prestar un servicio sin haberlo reportado.
- AC1 (alcance mínimo): catálogo de las 40 novedades con su definición literal y enlace al REPS. El usuario registra la novedad reportada (fecha, tipo, radicado, adjunto).
- AC2: Si la novedad es "apertura de servicio", el sistema sugiere agregar el servicio en el paso 2 y hacer su autoevaluación (art. 5.4).
- AC3: Un cierre temporal de servicio crea una alerta a 11 meses: "a los 12 meses sin reactivar, el servicio se inactiva".

### Etapa 6 — Tablero

**HU-6.1 [U]** Como gerente o administrador, quiero un tablero con el nivel de cumplimiento y las alertas por cercanía de los reportes, para saber en 10 segundos si estoy en riesgo.
- AC1: Indicadores de §6, todos con un clic para ver el detalle filtrado.
- AC2: Arriba, siempre visible, el bloque "Lo urgente": vencidos y ≤ 7 días, ordenados por fecha.
- AC3: El tablero respeta permisos: gerencia ve el tablero sin poder editar.

---

## 3. Datos mínimos por entidad (qué guardar, no el SQL)

**M** = mínimo (sin él, el módulo no sirve o se viola la norma) · **d** = deseable.

### 3.1 Catálogos GLOBALES (iguales para todos los tenants, solo lectura, sembrados por migración)

**A. Versión de norma** — permite convivir con la norma actual y con la que viene (MinSalud anunció un manual nuevo tras revocar la 1732/2026).
- M: código (`RES3100_2019_COMPILADA_2026-10`), nombre, fecha de consulta de la fuente, URL fuente, vigente desde, vigente hasta (nulo = vigente).
- Regla: los criterios, documentos y obligaciones cuelgan de una versión. Una clínica evalúa contra la versión vigente; las instantáneas cerradas conservan la versión con la que se hicieron.

**B. Estándares (7)** — M: código, nombre, definición literal, numeral del manual (8.3.1.x), orden.

**C. Servicios de la norma (42 entradas del numeral 11)** — M: numeral, grupo, nombre, descripción literal, complejidades posibles, modalidades posibles, categorías de telemedicina posibles. d: estructura literal.

**D. Bloques de aplicabilidad** — M: servicio, estándar, encabezado literal, subtítulo, `aplica_complejidad[]`, `aplica_modalidad[]`, `aplica_telemedicina_categoria[]`, `aplica_telemedicina_rol[]` (nulo = sin restricción), `aplica_tipo_edificacion` (para los subtítulos "uso exclusivo / mixto" de 11.1 IN, hoy solo en `subtitulo`; hay que normalizarlo).

**E. Criterios (3.975)** — M: id estable (p. ej. `11.1.TH.2`), bloque, número, padre, texto literal, página, `es_encabezado` (padre con hijos, derivado), `remite_a` (ver F), nota de vigencia, `vigente_desde` y `vigente_hasta` (p. ej. 2027-01-03 para los 44 derogados por la Res. 914/2025), confianza (alta/baja), fuente del texto. d: texto en lenguaje sencillo (fuera de esta entrega, §7).

**F. Remisiones entre criterios** — M: criterio origen → servicio o criterio destino, y el tipo (`a_11_1` | `a_otro_servicio` | `a_otra_complejidad`). Son 547 remisiones a 11.1 y 41 a otro servicio o complejidad. Las 41 se curan a mano una vez (es una tarea de datos para planeación, no del usuario).

**G. Mapeo catálogo de servicios → numeral** — M: `practica_medica_id` → uno o varios numerales, nota y nivel de confianza (de `mapeo-servicios.json`). 11.1 aplica siempre.

**H. Tipos de prestador (4)** y **condiciones de habilitación** por tipo (técnico-administrativa, suficiencia patrimonial, tecnológica-científica) — M.

**I. Documentos de inscripción (37)** — M: id, nombre corto, descripción literal, `aplica_a[]`, obligatorio, condición en texto y **condición evaluable** (regla legible por el sistema: `persona=juridica`, `edificacion_anio<2005`, `modalidad incluye telemedicina`, `servicio usa radiaciones ionizantes`, `servicios incluye urgencias|cirugia|uci`…), sección (radicar / evidencia de visita), tiene vencimiento (sí/no), regla de vigencia especial (`max_30_dias_a_radicacion`), fuente (norma, artículo, página, URL), verificado.

**J. Obligaciones de reporte (17)** — M: código, nombre, entidad (secretaría / Supersalud / MinSalud / INS), plataforma y URL, explicación corta en lenguaje sencillo, norma (nombre, número, artículo, URL), URL del instructivo, fecha de verificación del enlace, periodicidad, **regla de fecha estructurada** (fecha de corte, desfase o día fijo, p. ej. "corte 30-jun → 20-jul; corte 31-dic → 20-feb del año siguiente"), reglas distintas por grupo (FT001: C1 mensual, C2–D3 semestral, B según su EAPB), `aplica_a_tipos[]`, `aplica_a_grupos[]`, condición adicional (p. ej. "solo con telemedicina"), verificado, riesgos o notas.
- Incluye también las obligaciones "propias del prestador": autoevaluación/renovación REPS (fecha = vencimiento de la clínica), reporte mensual de telemedicina (primeros 5 días del mes, solo con telemedicina), verificación anual del grupo Supersalud.

**K. Novedades REPS (40)** — M: id, categoría (prestador / sede / servicio / capacidad), nombre, definición literal, fuente. d: requisitos por novedad (hoy solo la tabla de la SDS Bogotá, no verificada).

**L. Calendario de festivos de Colombia** — M para el aviso de día no hábil (D5). Fecha y nombre.

### 3.2 Datos POR CLÍNICA (tenant, RLS con `clinica_actual()`)

**1. Perfil regulatorio** (amplía `clinicas` o va en una tabla 1:1)
- M: tipo de prestador; naturaleza (pública / privada / mixta); persona natural o jurídica (ya existe `tipo_persona_id`); estado REPS (no inscrito / en trámite / inscrito / inactivo); código del prestador (ya existe); fecha de inscripción inicial; fecha de vencimiento vigente (la del REPS); secretaría de salud (departamento y código territorial); grupo Supersalud con su fecha de clasificación; ¿tiene revisor fiscal? (activa FP003); ¿está caracterizada como UPGD de SIVIGILA?
- d: respuestas del asistente de grupo (cifras en UVT), representante legal (nombre y documento).

**2. Sede: datos de edificación** (amplía `sedes`)
- M: tipo de uso de la edificación (exclusivo salud / mixto); año de construcción o última intervención. d: código de sede REPS.

**3. Servicio habilitado por sede** (amplía `clinica_servicios_habilitados` o una tabla hija; ver D1)
- M: sede; servicio (práctica médica); numeral o numerales resueltos (para filas uno-a-muchos, el elegido); complejidad; modalidades[]; telemedicina: categorías[] y rol[]; código de habilitación del servicio (ya existe); estado (por habilitar / habilitado / cierre temporal / cerrado); fecha de habilitación.
- d: capacidad instalada (camas, salas, consultorios: la pide el formulario REPS).

**4. Documento de inscripción de la clínica**
- M: documento del catálogo (o "adicional" con nombre libre); sede si aplica (RETIE y licencia de construcción son por edificación); estado (pendiente / cargado / no aplica); justificación de no aplica; **versiones** (archivo en bucket privado, nombre, fecha de expedición, fecha de vencimiento, subido por, fecha de carga); observaciones.
- Regla: el archivo nunca se borra, se versiona. Las URLs son firmadas, como en RRHH.

**5. Trámite de inscripción** (hitos)
- M: tipo de hito (radicado / devuelto / código asignado / visita previa programada / visita realizada / subsanación / constancia expedida / distintivo / visita de certificación); fecha; número o radicado; observación; adjunto; registrado por. Fecha planeada de radicación (para HU-3.2).

**6. Suficiencia patrimonial** — M: fecha de corte, patrimonio total, capital, obligaciones mercantiles >360 días, obligaciones laborales >360 días, pasivo corriente; los 3 indicadores se calculan y no se guardan como dato fuente.

**7. Evaluación de criterio** (append-only)
- M: criterio; ámbito (sede, para 11.1; o servicio × sede); estado (pendiente / cumple / no cumple / no aplica); justificación (obligatoria si no aplica); observación; responsable asignado; fecha de verificación; evaluado por; marca de tiempo; versión de la norma.
- Regla: el estado vigente es la última fila. Nunca se edita una fila; cada cambio es una fila nueva con auditoría (`fn_auditoria`).

**8. Evidencia de criterio** (N por evaluación)
- M: tipo (`archivo` | `documento_normativo` | `registro_modulo` | `enlace` | `nota`); referencia (ruta del archivo, id de documento normativo, o tabla+id del registro de otro módulo); descripción; fecha; agregado por.
- Regla: una evidencia que apunta a otro módulo no copia el dato; muestra su estado vivo (p. ej. "tarjeta profesional de Dra. X — vigente").

**9. Plan de mejora** — M: evaluación o criterio origen, acción, responsable, fecha compromiso, estado, evidencia de cierre, fecha de cierre.

**10. Ciclo de autoevaluación (instantánea)** — M: nombre o año, motivo (inscripción / 4.º año / renovación anual / novedad / levantamiento de medida), fecha de cierre, cerrado por, versión de la norma, fecha declarada en el REPS, resumen (totales por estado), detalle congelado de todos los criterios aplicables con su estado y sus evidencias en ese momento. Inmutable.

**11. Configuración de obligación por clínica** — M: obligación del catálogo, activa (sí/no), origen (automática / manual), justificación si se desactiva una automática o se activa una que no aplica, días de aviso (sobrescribe el valor por defecto), responsable (p. ej. el contador). d: correo adicional para alertas (contador externo, sin usuario en el sistema).

**12. Ocurrencia de obligación** — M: obligación, periodo cubierto (corte), fecha límite (la literal de la norma), ¿cae en día no hábil?, estado (pendiente / presentado / presentado extemporáneo / no aplica en el periodo / vencido, este último calculado), fecha de presentación, radicado o acuse, adjunto, presentado por, observación. Append-only al presentar (se corrige anulando).

**13. Novedad reportada** — M: tipo (catálogo K), sede o servicio afectado, fecha de reporte, radicado, adjunto, observación.

**14. Registro de alertas enviadas** — M: clínica, objeto (ocurrencia / documento / vencimiento REPS / plan de mejora), umbral (30/15/7/1/0), fecha de envío, destinatarios. Sirve para no repetir avisos y para demostrar que se avisó.

### 3.3 Retención y trazabilidad

Evaluaciones, evidencias, instantáneas, documentos y ocurrencias presentadas **nunca se borran**; solo se anulan o versionan, y el borrado físico es exclusivo de administrador y solo para registros "pendiente" sin evidencia. La autoevaluación es una declaración ante la autoridad sanitaria y la base de una visita de verificación o de un proceso sancionatorio (art. 10, par. 2: la inscripción puede revocarse en cualquier momento por incumplimiento).

---

## 4. Cómo filtrar los 3.975 criterios para que la clínica vea solo los suyos

Entradas: los servicios por sede del paso 2 (servicio → numeral(es), complejidad, modalidades, telemedicina categoría/rol) y los datos de edificación de la sede.

**Paso 1. Numerales aplicables.** Para cada servicio declarado en una sede, se toman sus numerales del mapeo (G). Para la sede se agrega **siempre 11.1**, una vez por sede, no por servicio (HU-4.3).

**Paso 2. Bloques que coinciden.** Para cada numeral, se incluye un bloque si se cumplen **todas** estas condiciones (las dimensiones del bloque en nulo no restringen):
- `aplica_complejidad` es nulo o contiene la complejidad declarada. Si el servicio es `no_aplica` en complejidad (terapias, laboratorio…), se ignora la dimensión.
- `aplica_modalidad` es nulo o **se cruza** con alguna modalidad declarada. Cuidado: `extramural` sin sub-modalidad (usado en 11.1, 11.6.2 y 11.6.3) coincide con cualquier sub-modalidad extramural declarada.
- Si el bloque es de telemedicina: `aplica_telemedicina_categoria` se cruza con las categorías declaradas **y** `aplica_telemedicina_rol` se cruza con el rol declarado (remisor / referencia).
- Para 11.1 Infraestructura con subtítulo de edificación: "uso exclusivo" solo si la sede es exclusiva; "uso mixto" solo si es mixta; "exclusivo y mixto" siempre.
- Los demás subtítulos de 11.1 ("Generalidades de los ambientes…", "Características de los ambientes que pueden ser requeridos…", "orden, aseo, limpieza…") **no** filtran: se muestran, y el usuario marca "No aplica" en lo que no corresponde (p. ej. ambientes de cirugía en un consultorio).

**Paso 3. Vigencia.** Se excluyen los criterios con `vigente_hasta` ≤ hoy y se incluyen los que tienen `vigente_desde` ≤ hoy. Así, el 3-ene-2027 los 44 criterios derogados por la Res. 914/2025 salen solos y entra el nuevo texto de 11.2.1.DO.23.6 (D4).

**Paso 4. Remisiones.**
- Remisión a 11.1 (547): el criterio se muestra como "derivado" y su estado sale del estándar homólogo de 11.1 de esa sede (HU-4.2 AC6). No se cuenta dos veces en los indicadores.
- Remisión a otro servicio o complejidad (41, p. ej. 11.2.2 → 11.2.1; farmacéutico mediana → baja): se agregan al conjunto los bloques del servicio o complejidad referidos, **solo del mismo estándar** que remite, con la etiqueta "exigido por remisión desde 11.2.2.TH.1". Así, un consultorio de dermatología (11.2.2) también ve los criterios de consulta general que la norma le exige por remisión.

**Paso 5. Jerarquía.** Los criterios padre con hijos se muestran como encabezado. Su estado se deriva: cumple si todos los hijos aplicables cumplen; no cumple si alguno no cumple; pendiente en otro caso.

**Paso 6. Deduplicación.** Si dos servicios de la misma sede llevan al mismo criterio (p. ej. dos filas del catálogo que mapean a 11.2.1), el criterio se evalúa una sola vez por sede y servicio de la norma.

Orden de magnitud para EWAH (11.2.2 consulta especializada, mediana, solo intramural): unos 391 criterios de 11.1 que no son de otras modalidades, más 15 de 11.2.2 y los de 11.2.1 que entran por remisión. Unos 450 en total, de los cuales unos 150 son raíces y el resto hijos o encabezados. **Esta cifra hay que mostrarla en la interfaz** ("Tienes N criterios; M se responden solos por remisión", con los valores reales calculados), porque reduce la ansiedad del usuario frente a la tarea.

**Hallazgos de calidad de datos que planeación debe corregir antes de sembrar** (no son decisiones del usuario):
1. `11.2.2`, bloque HC "Complejidad mediana / Modalidades intramural, extramural…": `aplica_modalidad` **omite `intramural`** aunque el encabezado literal lo incluye. Sin corregirlo, el criterio 11.2.2.HC.26 no le aparece a un consultorio especializado intramural, que es justo el caso de EWAH. Hay que revisar todos los bloques con un script que compare `encabezado_literal` contra `aplica_*`; este fue el único desajuste que encontré con la palabra "intramural".
2. Normalizar el subtítulo de edificación de 11.1 IN a una dimensión `aplica_tipo_edificacion`.
3. Curar a mano las 41 remisiones entre servicios (F).
4. 1 criterio con confianza baja (`11.3.7-2019.DO.10.1.4`, numeración reconstruida): mostrarlo con insignia.
5. `11.2.2.TH.1.1`: la frase "de especialista" está **suspendida provisionalmente** según la compilación de Supersalud (auto no verificado). Afecta directamente a EWAH (consulta especializada). Mostrar la nota de vigencia en el criterio y recomendar confirmación con el asesor.

---

## 5. Qué se reusa de módulos existentes y cómo se refleja como evidencia

Regla: **Habilitación no duplica datos de otros módulos; los referencia y muestra su estado vivo.** Si el dato no existe en el otro módulo, el criterio muestra "Falta en [módulo] → ir a cargarlo" en vez de pedir un archivo suelto.

| Fuente existente | Estándar o criterios de la Res. 3100 que respalda | Cómo se refleja |
|---|---|---|
| **Datos básicos** (0052/0055/0058): NIT, tipo de persona, código del prestador, departamento y ciudad, servicios habilitados con código | Perfil (paso 1), servicios (paso 2), documento NIT | Se leen y editan en su lugar de siempre. Habilitación no crea un segundo formulario de datos de la clínica. |
| **Parámetros → Sedes** (0011) | Sedes del REPS, 11.1 Infraestructura | Se agregan los 2 campos de edificación. |
| **RRHH → `empleados` + `documentos_empleado`** (tipos `acta_diploma`, `tarjeta_profesional`, `vacuna`, `identidad`, `examen_ocupacional`) y `empleados.numero_tarjeta_profesional` | 11.1 TH.1 (títulos), TH.2 (autorización de ejercicio o ReTHUS), criterios de vacunación y de inducción; TH propio de cada servicio | En cada criterio de TH: tabla de las personas que prestan el servicio con ✓/✗/vencido por documento requerido. El criterio se **sugiere** "Cumple" si todos tienen el documento vigente; el responsable confirma. **Hueco**: no existe el vínculo persona ↔ servicio habilitado. Se agrega en el paso 2 ("¿quién presta este servicio?"), apuntando a `empleados` (que ya enlaza a `usuarios` vía `usuario_id`). |
| **RRHH → `documentos_normativos`** (versionado; `tipos_documento_normativo.categoria='habilitacion'` **ya prevista y vacía**) | Procesos prioritarios (protocolos de bioseguridad, limpieza y desinfección, eventos adversos, consentimiento informado, guías de práctica clínica), plan de emergencias, plan de mantenimiento | Se siembran los tipos de documento de habilitación en esa misma tabla; la evidencia del criterio apunta a la versión vigente. No se crea otro repositorio de protocolos. |
| **Medio Ambiente** (0035/0036): `registros_temperatura_*`, `neveras`, `registros_residuos`, `extintores`, `registros_limpieza` | 11.1 MD (cadena de frío, almacenamiento), 11.1 IN (orden, aseo, limpieza y desinfección; gestión de residuos), 11.1 PP (PGIRASA), plan de emergencias (extintores) | Evidencia tipo "registro de módulo" con un resumen calculado: "Bitácora de temperatura nevera 1: 28/30 días del último mes, 0 fuera de rango"; "Extintores: 3 vigentes, 1 vence en 12 días". Los extintores vencidos generan alerta en el tablero de habilitación. |
| **Inventario** (0015/0031): insumos con registro INVIMA, lotes con vencimiento, proveedores | 11.1 MD (registro sanitario, trazabilidad de lote, fechas de vencimiento, proveedores) | Resumen calculado: "N insumos activos sin registro sanitario", "N lotes vencidos con existencia". Si hay alguno, se sugiere "No cumple". |
| **Consentimientos** (0040), **Historia clínica** (anamnesis/evoluciones, 0041–0045), **auditoría `fn_auditoria`** | 11.1 PP (consentimiento informado), 11.1 HC (contenido mínimo, trazabilidad, custodia) | Evidencia descriptiva del sistema: "EWAH registra consentimiento por tratamiento; historia clínica append-only con auditoría de cambios". Se ofrece una ficha de evidencia del software prellenada que el usuario puede adjuntar. |
| **Cron + Resend** (`alertas-rrhh`, `recordatorio-citas`) | Alertas del paso 5 | Mismo patrón: cron diario, correo agrupado por clínica, `CRON_SECRET`. |
| **Calendario de Agenda** (`react-big-calendar` en `citas/`) | Paso 5 | El mismo componente y la misma configuración regional; los eventos vienen de ocurrencias y vencimientos. |
| **Exportar xlsx** | HU-4.6 | Mismo mecanismo; Exportar solo para administrador. |

Nota para `planeacion`: con este cruce, Habilitación se vuelve el **consumidor** natural de RRHH, Medio Ambiente e Inventario. Conviene que esos módulos expongan una función de "resumen de cumplimiento" (consulta agregada), para que Habilitación no consulte sus tablas internas a mano.

---

## 6. Indicadores del tablero

Definición base: **% de cumplimiento = Cumple / (Cumple + No cumple + Pendiente)**. "No aplica" sale del denominador. Los criterios derivados por remisión a 11.1 y los encabezados no cuentan (se cuenta cada criterio evaluable una sola vez).

**Cumplimiento**
1. % de cumplimiento global (con la meta implícita: 100 % de lo aplicable; la norma no admite cumplimiento parcial).
2. % por estándar (7 barras), con el número de "No cumple" de cada uno.
3. % por servicio × sede, más el **estado de declaración** de cada servicio: Listo para declarar / Con incumplimientos / Sin evaluar. **Este es el indicador más importante**: un servicio con 98 % y un solo "No cumple" **no** puede declararse (art. 5).
4. Avance de evaluación: criterios evaluados / aplicables (distinto del cumplimiento; muestra cuánto falta por revisar).
5. Criterios por re-verificar (más de 12 meses sin verificar).
6. Planes de mejora abiertos, vencidos y por vencer.

**Documentos**
7. Documentos de inscripción: cargados / aplicables (para radicar) y evidencias de visita.
8. Documentos vencidos y por vencer (≤ 30 días), incluidos los referenciados de RRHH y Medio Ambiente (extintores, tarjetas, vacunas).

**Obligaciones**
9. Días para el vencimiento de la inscripción REPS (contador grande, en ámbar desde 90 días y en rojo desde 30).
10. Próximas obligaciones por semáforo (rojo ≤ 7 días o vencidas, ámbar 8–30, verde > 30), con el enlace directo al portal.
11. Reportes presentados a tiempo / total del último año (indicador de disciplina; útil para gerencia).
12. Obligaciones "por confirmar" (sin verificar o desactivadas sin justificación).

**Gerencial [D, BI]**: todo queda filtrable por sede, servicio, estándar y responsable, y por fecha mediante el historial de evaluaciones. Así se puede responder "¿cómo evolucionó nuestro cumplimiento trimestre a trimestre?", usando las instantáneas de autoevaluación como cortes.

---

## 7. Lo que NO entra en esta primera entrega (y por qué)

| Fuera de alcance | Por qué |
|---|---|
| Radicar o cargar en REPS, nRVCC o PISIS desde EWAH | No hay API pública para prestadores. Se entrega el enlace, el instructivo y el registro de "presentado". |
| Generar los archivos FT001/FT003/FT004 (XML firmado) o RIPS JSON | Exigen un módulo contable y de facturación (catálogo de cuentas Supersalud, cartera, pasivos por tercero) que EWAH no tiene. Sería un módulo propio, el día que exista Financiero. |
| Cálculo automático de suficiencia patrimonial desde la contabilidad | Mismo motivo; esta entrega incluye solo la calculadora manual de 5 cifras (HU-3.3). |
| Requisitos documentales por cada una de las 40 novedades (tablas 3 a 6 del Manual) | El PDF oficial es un escaneo ilegible y solo existe la tabla territorial de la SDS Bogotá, no verificada. Se entrega el catálogo de novedades con su definición y el registro de la novedad reportada. |
| Reporte diario de capacidad instalada (internación y urgencias) | Es operativo y diario. Solo aplica a prestadores con internación o urgencias, que hoy no son el público del producto. Queda en el catálogo como obligación informativa. |
| SIVIGILA y ST002 (PAMEC) con fechas exactas | No verificados (`verificado=false`). Se muestran como "por confirmar", sin alertas automáticas. |
| Explicación en lenguaje sencillo de cada uno de los 3.975 criterios | Redactarla bien es trabajo editorial y clínico grande; una explicación equivocada tiene riesgo legal. Esta entrega usa el texto literal y la cita. Fase 2: explicaciones curadas para los ~450 criterios del caso estético, o asistente IA con revisión humana. |
| Bloquear otros módulos (p. ej. no dejar agendar un servicio "no apto") | Es una decisión de producto con impacto operativo fuerte. En esta entrega el estado es informativo y visible en el tablero. |
| Asistente que simula la visita de verificación de la secretaría | Valioso pero no esencial; la exportación de la autoevaluación cerrada cubre la necesidad básica. |
| Migración al manual nuevo que anunció MinSalud | Todavía no se expide. El modelo queda versionado (catálogo A) para que entre como una versión nueva sin rehacer el módulo. |
| Módulo SG-SST completo | Es otro módulo (está en el backlog). Habilitación solo **consume** lo que ya hay en RRHH y Medio Ambiente. |

---

## 8. Decisiones abiertas para el usuario (bloqueantes)

**D1. ¿Dónde y con qué detalle se declaran los servicios a habilitar?** (bloquea el filtro de criterios y el paso 2)
- A. Ampliar la fila existente de "Servicios habilitados" (Datos básicos) para que sea por **sede** y lleve complejidad, modalidades y telemedicina. Habilitación y Datos básicos editan el mismo dato.
- B. Dejar "Servicios habilitados" como está (lista por clínica con código) y crear la declaración por sede, complejidad y modalidad solo dentro de Habilitación.
- C. No manejar sede: servicios por clínica con complejidad y modalidad.
- **Recomiendo A.** El REPS habilita por sede y no conviene tener dos verdades sobre "qué servicios presto". La pantalla de Datos básicos mostraría un resumen y enlazaría a Habilitación para el detalle. C se queda corta en cuanto la clínica tenga una segunda sede.

**D2. Servicios del catálogo con mapeo dudoso o uno-a-muchos** (Cuidado intermedio y Cuidado intensivo → 3 servicios de la norma cada uno; Unidad de quemados; Obstetricia → hospitalización + parto; Consumo de SPA → 11.4.10/11.4.11/11.4.12; Fisioterapia, Fonoaudiología, Terapia ocupacional y Terapia respiratoria cargadas en Consulta Externa pero que la norma ubica en 11.3.1 Terapias; Enfermería, Nutrición, Psicología y Optometría inferidas a 11.2.1)
- A. Dividir en el catálogo las filas uno-a-muchos (p. ej. "Cuidado intermedio adulto / pediátrico / neonatal" como 3 servicios) y corregir el grupo de las 4 terapias a "Apoyo diagnóstico" según la norma.
- B. Mantener las filas como están y, al seleccionarlas, pedir al usuario que elija a cuál o cuáles servicios de la norma corresponde.
- C. Mantener las filas y asignar automáticamente todos los numerales posibles (el usuario marca "No aplica" en lo que sobre).
- **Recomiendo A para las filas uno-a-muchos y las terapias, y B solo para Obstetricia y SPA**, que son ambiguas por naturaleza. C infla el checklist con cientos de criterios ajenos y es justo lo que queremos evitar. Las inferencias de 11.2.1 (enfermería, nutrición, psicología, optometría) se aceptan con nota visible.

**D3. Versión de 11.3.7 Quimioterapia** (la Res. 1410/2022 sustituyó el numeral, pero sus criterios 8 a 10 remiten al texto de 2019)
- A. Mostrar el texto de 2022 como vigente y, por remisión, solo los criterios de 2019 a los que remiten los criterios 8 a 10 de 2022.
- B. Mostrar solo el texto de 2022.
- C. Mostrar ambos completos.
- **Recomiendo A**, con confirmación del asesor jurídico antes de que un tenant con quimioterapia lo use. No afecta a EWAH, así que no bloquea la primera entrega para su caso; sí bloquea sembrar 11.3.7 como "verificado".

**D4. Criterios con vigencia futura: Res. 914/2025** (44 criterios de esterilización y reúso derogados desde el **3-ene-2027**, y 11.2.1.DO.23.6 con texto nuevo desde esa fecha)
- A. Mostrarlos hoy con la insignia "Deja de exigirse el 3-ene-2027". Ese día salen solos del conjunto aplicable (y entra el texto nuevo de DO.23.6), sin intervención. Las instantáneas ya cerradas los conservan.
- B. Ocultarlos desde ya, porque faltan menos de 3 meses.
- C. Ignorar la fecha y retirarlos con una migración manual en enero.
- **Recomiendo A.** Hoy son exigibles: si llega una visita en noviembre de 2026, se los pueden pedir. B dejaría a la clínica expuesta. C depende de que alguien se acuerde.

**D5. Fechas límite que caen en día no hábil** (p. ej. 20-feb-2027 es sábado, 20-jul-2027 es festivo, 10-abr-2027 es sábado, 28-feb-2027 es domingo; la norma fija fechas calendario y no se verificó si Supersalud corre el plazo)
- A. Usar la fecha literal de la norma como límite y avisar de forma explícita "cae en día no hábil, preséntalo antes".
- B. Correr la fecha al día hábil siguiente (regla general de plazos administrativos).
- C. Mostrar ambas fechas.
- **Recomiendo A**, por ser conservadora: si el plazo sí corre, la clínica presentó antes y no pierde nada; si no corre y usamos B, la clínica queda extemporánea por culpa del software. Se puede cambiar a B si Supersalud lo confirma por escrito.

**D6. RIPS para servicios estéticos** (la Res. 948/2026, art. 2, par. 1, excluye de RIPS como soporte de la FEV a la "cirugía estética… que no se financie con recursos públicos"; no está verificado si cubre la medicina estética no quirúrgica, como toxina o rellenos)
- A. Mostrar la obligación RIPS como "Aplica — confirma con tu asesor" para todos los prestadores, y permitir desactivarla con justificación escrita y fecha de la consulta al asesor.
- B. Excluirla automáticamente cuando la clínica declare que solo presta servicios estéticos de pago particular.
- C. Dejar RIPS fuera del calendario en esta entrega.
- **Recomiendo A.** Es una interpretación jurídica que no le corresponde al software. A deja el rastro de quién decidió y con qué sustento. Para EWAH en particular, conviene que el usuario lo consulte ya con su asesor tributario y de salud, porque si aplica, cada factura electrónica debe llevar RIPS validado (con un plazo de 22 días hábiles para radicar ante el pagador cuando lo hay).

---

## 9. Supuestos que tomé (no bloqueantes, conviene confirmar)

1. Módulo RBAC nuevo `habilitacion` con VIEW, CREATE, EDIT, EXPORT (solo administrador, como el resto del sistema), APPROVE (cerrar autoevaluación) y DELETE (solo administrador, solo registros pendientes sin evidencia).
2. **Plan comercial:** recomiendo Habilitación como **entitlement de pago**, como Anexos, Inventario y Campañas. En el plan Gratis se vería el calendario de obligaciones y el tablero en solo lectura, como gancho de venta. Es una decisión comercial del usuario.
3. Los documentos de habilitación (incluida la información financiera) van en un bucket privado propio con URLs firmadas. Solo los ven usuarios con permiso `habilitacion/VIEW`.
4. Los avisos por defecto (30/15/7/1/0 días y 90/60 para la autoevaluación REPS) unifican la inconsistencia de 30 frente a 90 días que la spec heredada (`docs/spec-ewah-app.md` §8.12) señala para Habilitación.
5. Los enlaces oficiales se guardan con su fecha de verificación. Recomiendo una revisión trimestral de los enlaces (hoy 2 responden mal: la consulta de habilitados del REPS da HTTP 500 y el enlace de novedades de la SDS da 404).

## 10. Checklist transversal (director-proyecto)

- [x] **Dato sensible o clínico:** las evaluaciones y la información financiera son sensibles a nivel de negocio, no clínico. RBAC con permiso propio; append-only en evaluaciones, ocurrencias presentadas e instantáneas.
- [x] **Alimenta un reporte externo:** sí (autoevaluación REPS, FT a Supersalud, RIPS). Todo queda estructurado en catálogos con ids estables, nunca en texto libre (excepto justificaciones y observaciones).
- [x] **Toca insumos:** indirectamente. Se consume Inventario (INVIMA, lote, vencimiento) como evidencia; no se crean insumos.
- [ ] **Toca dinero o facturación:** no factura. Solo la calculadora de suficiencia patrimonial (dato informativo) y el señalamiento de RIPS (D6).
- [x] **Registro que se debe conservar:** sí. Nada se borra; versionado y anulación.
- [x] **KPI de negocio:** sí. % de cumplimiento por estándar, servicio y sede en el tiempo, y disciplina de reporte (§6).
- [x] **Roles que no deben ver:** recepción y profesionales sin permiso no ven documentos financieros ni el tablero. El profesional ve solo los criterios que tiene asignados, si se le da VIEW acotado (para confirmar con `lider-tecnico`).
