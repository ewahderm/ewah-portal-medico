# Módulo Recursos Humanos (RRHH) — requerimiento optimizado

Este es el requerimiento aprobado que guio la implementación. El módulo ya está implementado; las diferencias y correcciones incorporadas durante su construcción se registran en `TASKS.md` y prevalecen sobre cualquier detalle técnico desactualizado de este documento.

## Contexto

EWAH ya tiene Pacientes/Agenda/Tratamientos/Inventario/Campañas/Medio Ambiente/Suscripción/Plataforma/Exportar construidos y en producción (rama `staging`, limpia). El usuario pidió ahora el módulo de **Recursos Humanos** — el primero de tres módulos de cumplimiento pendientes (RRHH → SG-SST → Habilitación, en ese orden). Dio un requerimiento inicial extenso en prosa y pidió explícitamente que se optimizara con `director-proyecto` + `lider-tecnico` + `planeacion`, investigando legislación colombiana (Ministerio de Trabajo, Secretaría de Salud, Supersalud, DIAN), dejando el diseño listo para que el resto de agentes (backend, frontend, QA, UX) lo ejecute **sin hardcodear nada** y **sin ambigüedades**.

Decisión ya tomada con el usuario: **se construye todo de una sola entrega** (no por fases), después de agotar aquí todas las preguntas bloqueantes — ya se hicieron 2 rondas de `AskUserQuestion` y quedaron resueltas. Lo que sigue es el requerimiento final, listo para pasar a `arquitectura-backend`/`arquitectura-frontend`/`desarrollo-fullstack`.

**Decisiones de alcance ya confirmadas por el usuario** (no volver a preguntar):
1. Entrega única, todo el alcance de abajo.
2. `accidentes_trabajo` y `documentos_normativos` (protocolos/manuales) se diseñan como **tablas compartidas** reusables por el futuro módulo SG-SST — no se duplican.
3. Contrato "por servicios" tiene un **flujo separado** de nómina (honorarios, no salario) — con retención en la fuente automática (11%/10%) y verificación (no bloqueante) de aportes a seguridad social del independiente.
4. Retención en la fuente **salarial** (procedimiento 1/2, tablas UVT) queda **fuera de esta entrega** — el comprobante de nómina de empleados la deja como campo editable manual.
5. Permisos del módulo: **propio, con niveles** (separar ver documentos/empleados de ver salarios/nómina).
6. **Alertas automáticas por correo** (vencimientos + plazo ARL) sí se construyen, reusando el cron ya existente.

---

## 1. Requerimiento de negocio (director-proyecto)

### 1.1 Empleado — datos maestros

Historia: *Como administrador de la clínica, quiero registrar la ficha completa de cada persona que trabaja para la clínica (con o sin acceso al sistema), para tener su información laboral centralizada y poder generarle pagos/documentos.*

Campos pedidos por el usuario (todos mínimos): nombre y apellidos, fecha de nacimiento, celular, email, tipo de identificación (reusa catálogo global `tipos_identificacion` ya existente), número de identificación, **categoría de contrato** (laboral / servicios — determina qué secciones del módulo aplican), tipo de contrato específico (catálogo, ver §3.1), fecha de inicio/fin de contrato, EPS (catálogo global ya existente), fondo de pensiones (catálogo global **nuevo**), fondo de cesantías (catálogo global **nuevo**), ARL (catálogo global **nuevo**), tarjeta profesional (si aplica), preferencia de pago (quincenal/mensual), tipo de cuenta bancaria (catálogo), número de cuenta, banco (catálogo).

**Enriquecimiento (director-proyecto, no pedido explícitamente):**
- Declarante de renta (sí/no) — campo mínimo nuevo, obligatorio para calcular la retención de honorarios de los contratos "por servicios" (DIAN).
- Clase de riesgo ARL del cargo (I-V) — necesaria para calcular el aporte patronal a ARL en la nómina; es un dato del **cargo**, no de la persona (dos empleados con cargos distintos en la misma clínica pueden tener clase de riesgo distinta).
- `usuario_id` opcional — si la persona ya tiene cuenta en el sistema (profesional, administrativo), se vincula; si no (aseo, servicios generales), queda sin cuenta. Evita capturar dos veces el mismo nombre.

### 1.2 Documentación del empleado

Historia: *Como administrador, quiero guardar la evidencia documental de cada empleado (identidad, idoneidad, vacunación, exámenes, currículum, cuenta bancaria), para responder ante una inspección del Ministerio de Trabajo o una auditoría de habilitación sin tener que buscar papeles.*

- Documento de identidad (foto/PDF), tarjeta profesional (foto/PDF, solo si aplica), contrato de trabajo (PDF), certificado de cuenta bancaria.
- **Vacunas** (varias por empleado): tipo de vacuna (catálogo, no texto libre), evidencia (foto/PDF), fecha de aplicación, fecha de caducidad, vigente (**calculado** de `fecha_caducidad >= hoy`, nunca un campo guardado que se desincronice).
- **Exámenes ocupacionales** (varios): tipo (catálogo: ingreso / periódico / retiro — fijo por norma SG-SST, pero igual como catálogo por si la clínica necesita un subtipo propio), evidencia (foto/PDF), fecha del examen.
- **Currículum** (PDF) con 3 sub-bloques de documentación propia (cada uno 0..N documentos): certificados laborales (foto/PDF), actas y diplomas (nombre + fecha de emisión + archivo), otros certificados (nombre + archivo).

**Enriquecimiento regulatorio:** la tarjeta profesional y los certificados de idoneidad aquí capturados son exactamente el insumo que el futuro módulo de **Habilitación** (Resolución 3100/2019, estándar de Talento Humano) necesitará para su checklist de "personal habilitado por servicio" — se diseña la tabla para que ese módulo futuro solo la **consulte**, no la reconstruya (ver §3.4).

### 1.3 Historial de cargo y salario

Historia: *Como administrador, quiero ver cómo ha cambiado el cargo y el salario de un empleado en el tiempo, con el acta que sustenta cada cambio, para tener trazabilidad ante una reclamación laboral.*

Cargo y salario **cambian de forma independiente** (un ascenso sin aumento, un aumento sin cambio de cargo) — se modelan como dos historiales paralelos, cada uno con su propia fecha de inicio/fin y su acta (PDF opcional), append-only (cerrar el período anterior + abrir uno nuevo, nunca editar un período ya cerrado).

### 1.4 Incapacidades

Historia: *Como administrador, quiero registrar cada incapacidad médica de un empleado (origen, gestión con la EPS, pago), para llevar el control de ausentismo y saber si a alguien le falta el pago de una incapacidad.*

Campos: fecha de inicio, días de incapacidad, origen (enfermedad general / accidente o enfermedad laboral — si es laboral, **se vincula** al registro de Accidentes Laborales, §1.6, no se duplica la captura), gestionada con la EPS (sí/no), EPS pagó (sí/no), fecha de pago.

**Enriquecimiento regulatorio** (confirmado contra la norma vigente 2026, Decreto 1072/2015 y conceptos de Minsalud): el sistema debe mostrar, según el origen, quién paga qué tramo —
- Enfermedad general: días 1-2 empleador (66,66%), días 3-90 EPS (66,66%), días 91-180 EPS (50%), desde 181 el fondo de pensiones si hay calificación de invalidez.
- Accidente/enfermedad laboral: ARL paga 100% desde el día 1.

Esto no cambia el esquema (son reglas de visualización/cálculo informativo en el comprobante de incapacidad), pero si no se muestra, el personal administrativo puede cobrarle o pagarle a la persona equivocada.

### 1.5 Vacaciones

Historia: *Como administrador, quiero registrar cada período de vacaciones tomado (con la carta de solicitud) y ver cuántos días tiene acumulados un empleado, para aprobar solicitudes sin calcular a mano.*

Campos: carta de solicitud (PDF), fecha de inicio, fecha de fin, días hábiles tomados. **Cálculo de acumulado** (confirmado contra Art. 186 CST): 1,25 días por mes completo trabajado desde el inicio del contrato (o desde el último corte), menos los días ya tomados — el cómputo solo cuenta días hábiles (excluye domingos y festivos). **Aplica solo a contratos de categoría "laboral"** — un contrato "por servicios" no genera vacaciones por ley (ver §1.8).

### 1.6 Accidentes laborales (tabla compartida con el futuro SG-SST)

Historia: *Como administrador, quiero registrar un accidente laboral con su investigación y cierre, y que el sistema me alerte si estoy por vencer el plazo legal de reporte a la ARL, para no exponer a la clínica a una sanción.*

Campos pedidos: fecha, resumen de lo sucedido, causa, acciones correctivas, flags (reportado al centro de trabajo, reportado a la ARL, en investigación, plan de acción correctivo, cerrado), fecha de reporte al centro de trabajo, fecha de reporte a la ARL, si genera incapacidad (vínculo a §1.4), fecha de cierre, resumen de cierre.

**Enriquecimiento regulatorio (bloqueante para la UX, confirmado contra Decreto 1072/2015 Art. 2.2.4.1.7):** el empleador tiene **2 días hábiles** desde la ocurrencia para reportar a la ARL mediante el FURAT. El sistema debe calcular y mostrar ese plazo (alerta visual + correo si está por vencer o ya venció sin marcar "reportado a la ARL") — no es un campo decorativo, es una fecha límite legal con sanción si se incumple.

### 1.7 Comprobante de pago de planilla de seguridad social de la clínica

Historia: *Como administrador, quiero guardar cada mes el comprobante de pago de la planilla (PILA) de la clínica, para tener el soporte de cumplimiento disponible.*

Un registro mensual por clínica: período, archivo (PDF), fecha de pago. Es el pago **consolidado de la clínica como empleador** — distinto del comprobante individual de honorarios de un contratista "por servicios" (§1.8), que es su propia responsabilidad como independiente.

### 1.8 Nómina / comprobante de pago — dos flujos según categoría de contrato

**Enriquecimiento regulatorio bloqueante, ya resuelto con el usuario:** un contrato "por prestación de servicios" en Colombia **no es una relación laboral** (es civil/comercial) — por ley no genera nómina, vacaciones, cesantías ni prima de servicios. Tratarlo igual que un contrato laboral en el mismo flujo de "nómina" sería construir algo que contradice el Código Sustantivo del Trabajo y expone a la clínica a que la UGPP/un juez laboral lo recalifique como "contrato realidad". Por eso hay **dos flujos distintos**, nunca uno solo con una bandera:

**A) Nómina de empleados (categoría "laboral" — fijo/indefinido/etc.):**
- Entrada: período (quincenal/mensual, según `preferencia_pago` del empleado), salario base (tomado del historial de salario vigente en ese período, §1.3), auxilio de transporte (si el salario ≤ 2 SMLV, valor legal vigente del año), comisiones (con un flag de si hacen parte del salario base para el cálculo, como pidió el usuario).
- Deducciones al empleado: salud 4%, pensión 4% — sobre el IBC.
- Aportes patronales (no se descuentan al empleado, informativos en el comprobante): salud 8,5% y pensión 12% (si la clínica NO tiene exoneración), ARL (según la clase de riesgo del cargo, tarifa vigente — Decreto 1607/2002), parafiscales SENA 2%/ICBF 3%/Caja de Compensación 4% (si la clínica no está exonerada) — **la exoneración (Ley 1607/2012) aplica a salud+SENA+ICBF cuando la clínica es persona jurídica declarante de renta y el empleado gana menos de 10 SMLMV** — campo a nivel de clínica, no a inventar por empleado.
- Retención en la fuente salarial: **fuera de esta entrega** (campo editable manual, el contador de la clínica lo ajusta).
- El comprobante se calcula automáticamente al crearlo, queda **editable manualmente** antes de confirmarlo, y una vez confirmado es append-only (anular + regenerar si hay error, nunca editar un comprobante ya confirmado — mismo estándar del proyecto). Se imprime en PDF con el logo/nombre comercial de la clínica (ya existe, ver `personalizacion_marca_clinica`).

**B) Comprobante de honorarios (categoría "servicios"):**
- Entrada: período, valor bruto pactado.
- Retención en la fuente: **11% si el contratista es declarante de renta, 10% si no** (campo `declarante_renta` del empleado, §1.1) — sin base mínima, aplica desde el primer peso (confirmado DIAN, tarifas 2026).
- **Verificación de seguridad social del independiente**: el formulario permite adjuntar el comprobante de pago de PILA independiente del período; si falta, se muestra una advertencia pero **no bloquea** el pago (decisión del usuario) — es un control de buena práctica frente a una eventual auditoría de la UGPP, no una obligación de bloqueo legal para el sector privado.
- Sin vacaciones, sin cesantías, sin prima, sin aportes patronales de ARL/parafiscales por parte de la clínica (el independiente cotiza por su cuenta sobre el 40% del valor del contrato).
- No requiere factura electrónica salvo que el contratista supere 3.500 UVT/año de ingresos (~$183M COP, umbral DIAN 2026) — el sistema genera una **cuenta de cobro** por defecto; si el contratista ya factura electrónicamente, se adjunta su factura en vez de generar la cuenta de cobro.

### 1.9 Multi-país

Historia: *Como EWAH Tech, quiero que una clínica fuera de Colombia pueda usar RRHH sin que se le pidan campos que no le aplican, para poder vender la plataforma en México, Perú, República Dominicana y Panamá sin reconstruir el módulo.*

**Corrección del usuario sobre el diseño inicial:** no es un simple "ocultar todo lo colombiano para los demás países" — hay que distinguir dos cosas distintas:

1. **Generalidades universales de RRHH** (afiliación a salud, afiliación a pensión/jubilación, afiliación a un fondo de cesantías/ahorro equivalente, nivel de riesgo del cargo) — estos conceptos **sí existen en México (IMSS/INFONAVIT/AFORE), Perú (EsSalud/ONP/AFP), República Dominicana (TSS/SENASA/AFP) y Panamá (CSS)**, solo que con entidades y reglas propias de cada país. Estos campos **se mantienen visibles para cualquier país** — se capturan como generalidad (afiliado sí/no + nombre de la entidad), nunca se ocultan solo por no ser Colombia.
2. **Reglas/cálculos específicos de la legislación colombiana** (fórmula de 1,25 días/mes de vacaciones del Art. 186 CST, el split de pago de incapacidad día 1-2/3-90/91-180, las tarifas ARL del Decreto 1607/2002, la exoneración de aportes de la Ley 1607/2012, el SMLV/auxilio de transporte, la retención de honorarios 11%/10% DIAN) — estas **sí son exclusivas de Colombia** y no se activan ni se calculan para ningún otro país, porque no tienen equivalente verificado todavía.

**Alcance confirmado:** NO se construye la legislación/tarifas específicas de otros países en esta entrega — pero el esquema queda **país-agnóstico desde el día uno** (ver §3.3), listo para que cuando se decida soportar México/Perú/RD/Panamá en serio, solo haga falta sembrar el catálogo y los valores legales de ese país, sin tocar tablas ni migrar datos.

### 1.10 Protocolos y manuales de RRHH (tabla compartida con SG-SST/Habilitación)

Historia: *Como administrador, quiero tener un repositorio versionado de los protocolos y manuales obligatorios de la clínica, para mostrarlos en una auditoría y no perder la versión vigente.*

Protocolos pedidos por el usuario: protocolo de contratación, manual de funciones, protocolo de atención de acoso sexual, protocolo de atención de acoso laboral, protocolo de solicitud de vacaciones, protocolo de reporte de accidentes de trabajo.

**Enriquecimiento regulatorio (lo que el usuario no mencionó y el Ministerio del Trabajo sí exige):**
- **Reglamento del Comité de Convivencia Laboral** (Resolución 652/2012, actualizada por 3461/2025) — el protocolo de acoso laboral sin este comité bipartito constituido está incompleto; agregar como protocolo adicional.
- **Protocolo de acoso sexual integrado al SG-SST con canal de denuncia confidencial** (Ley 2365/2024, vigente) — más estricto de lo que probablemente se conocía al pedirlo: exige difusión, capacitación, y reporte semestral a SIVIGE. El protocolo guardado aquí debe dejar evidencia de que existe ese canal, no solo el documento.
- **Reglamento Interno de Trabajo** — documento obligatorio para toda empresa con más de 5 trabajadores (comerciantes) o más de 10 (no comerciantes), casi siempre ausente cuando no se pide explícitamente.
- **Política de Seguridad y Salud en el Trabajo** (firmada por el representante legal, Decreto 1072/2015) — normalmente vive en SG-SST, pero como SG-SST aún no existe, se captura aquí y se reclasifica cuando se construya ese módulo (por eso la tabla es compartida desde ya).

Cada protocolo es un documento **versionado** (nueva versión = nueva fila con fecha de vigencia, nunca se sobreescribe la anterior) con una `categoria` (rrhh / sgsst / habilitacion) — el usuario explícitamente pidió evitar duplicar esto cuando se construya SG-SST; la categoría es justo el mecanismo que lo permite sin tabla nueva.

---

## 2. Checklist transversal aplicado (director-proyecto)

- [x] Dato clínico/sensible → no aplica a nómina/salario per se, pero sí es dato personal sensible bajo habeas data (Ley 1581/2012) — RBAC propio con niveles (confirmado §permisos), nunca editable in-place tras confirmar un comprobante.
- [x] Alimenta un reporte externo → la nómina alimenta eventualmente PILA/exógena DIAN; captúrese ya estructurado (catálogos, no texto libre), aunque el reporte en sí no se construya ahora.
- [ ] Insumo/medicamento → no aplica a este módulo.
- [x] Toca dinero → retención de honorarios resuelta (DIAN); retención salarial diferida explícitamente, no omitida por descuido.
- [x] Registro que una norma exige conservar → nunca editable/borrable, solo anulable (nómina, incapacidades, accidentes).
- [x] Debe poder filtrarse/agregarse para un KPI → costo de nómina por período/sede, headcount por tipo de contrato — queda disponible de inmediato por ser datos estructurados, no se construye el reporte ahora pero no haría falta migrar nada para construirlo después.
- [x] Rol que no debería ver este dato → resuelto con permiso de nivel "salarios/nómina" separado del de "empleados/documentos".

---

## 3. Requerimiento técnico (lider-tecnico)

### 3.1 Catálogos nuevos (todo editable, nada hardcodeado)

Todos siguen el motor genérico de Parámetros (`lib/parametros/registry.ts`) salvo que se indique lo contrario:

**Corrección de diseño (ver §1.9):** los catálogos de entidades de seguridad social (`eps` ya existente, `fondos_pension`, `fondos_cesantias`, `arls`) ganan una columna `pais_id` (FK al catálogo global `paises`) — **no son exclusivos de Colombia**, son genéricos por país. Hoy solo se siembran las entidades reales colombianas; el día que se opere en otro país, agregar sus entidades es una fila nueva en el catálogo, no una migración. El combobox de cada campo en el formulario de empleado se filtra por el `pais_operacion_id` de la clínica — para un país sin entidades sembradas todavía, el campo sigue existiendo (generalidad) pero el combobox aparece vacío hasta que se cargue el catálogo de ese país.

| Catálogo | Alcance | Nota |
|---|---|---|
| `eps` (ya existente) | Global, **+ columna `pais_id`** | Hoy solo tiene EPS colombianas; se vuelve reusable por otros países sin migrar tabla |
| `fondos_pension` | Global, **por país** | Mismo criterio |
| `fondos_cesantias` | Global, **por país** | Mismo criterio |
| `arls` | Global, **por país** | Representa la generalidad "entidad de riesgos laborales" — en Colombia es ARL, en otros países el equivalente que se cargue a futuro |
| `tipos_contrato` | Global, con columna `categoria` fija (`laboral`/`servicios`) | La categoría determina qué sub-módulos aplican — no es editable por la clínica, solo el nombre/código del tipo dentro de esa categoría. No depende del país. |
| `tipos_vacuna` | Por clínica | Evita texto libre en el historial de vacunación — aplica a cualquier país |
| `tipos_examen_ocupacional` | Global, sembrado con ingreso/periódico/retiro | Generalidad de salud ocupacional, no exclusiva de Colombia |
| `tipos_cuenta_bancaria` | Global, sembrado con Ahorros/Corriente | Generalidad bancaria universal |
| `bancos` | Global, **+ columna `pais_id`** | Lista de entidades bancarias por país — hoy solo colombianas |
| `cargos` | Por clínica | Usado en el historial de cargo (§1.3) — no depende del país |
| `tipos_documento_normativo` | Global (categorías rrhh/sgsst/habilitacion ya cubren la clasificación de fondo; este catálogo es solo el nombre del tipo de documento) | — |
| `clases_riesgo` | Global, **por país** | Generalidad "nivel de riesgo del cargo" (bajo/medio/alto o I-V) — la TARIFA asociada a cada clase (ver `clases_riesgo_arl` en §3.2) sí es exclusivamente colombiana y solo se usa cuando `pais_operacion = Colombia` |

**Fuera del motor genérico (tablas bespoke, como Insumos/Proveedores):**
- `empleados` — se amplía la tabla ya existente (de Medio Ambiente) con todas las columnas de §1.1. No se crea tabla nueva ni se migra el `empleado_id` ya usado en `registros_limpieza`/`registros_residuos`.
- `valores_legales_pais` (SMLV, auxilio de transporte, UVT por país+año) y `clases_riesgo_arl` (tarifa por clase I-V+país, vigente desde una fecha) — mantenidas por EWAH Tech (super admin), no por cada clínica, porque son valores nacionales compartidos por todas las clínicas de ese país. Mismo patrón de gestión centralizada que `planes`.

### 3.2 Esquema (tablas nuevas, todas con `clinica_id` + RLS `clinica_actual()` salvo las compartidas globales ya marcadas)

- `empleados` (ampliada): + `fecha_nacimiento`, `celular`, `email`, `tipo_identificacion_id`, `numero_identificacion`, `tipo_contrato_id`, `fecha_inicio_contrato`, `fecha_fin_contrato`, `eps_id` (nullable), `fondo_pension_id` (nullable), `fondo_cesantias_id` (nullable), `arl_id` (nullable), `clase_riesgo_id` (nullable, a nivel de cargo/empleado), `tarjeta_profesional` (texto, nullable), `preferencia_pago` (quincenal/mensual), `tipo_cuenta_bancaria_id`, `numero_cuenta`, `banco_id`, `declarante_renta` (boolean, solo relevante si `categoria_contrato='servicios'`), `usuario_id` (nullable, FK a `usuarios`), `activo`.
- `documentos_empleado` — polimórfica por `tipo` (identidad/tarjeta_profesional/contrato/certificado_bancario/vacuna/examen_ocupacional/certificado_laboral/acta_diploma/otro_certificado), `empleado_id`, `storage_path`, metadatos (nombre, fecha_emision si aplica), `fecha_evento` (fecha de vacuna/examen), `fecha_vencimiento` (nullable, solo vacunas) — patrón Storage ya establecido (`tratamiento_anexos`), bucket privado nuevo `documentos-empleados`.
- `historial_cargos_empleado` / `historial_salarios_empleado` — append-only, `fecha_inicio`/`fecha_fin` (null = vigente), `acta_storage_path` opcional.
- `incapacidades_empleado` — append-only.
- `vacaciones_empleado` — append-only.
- `accidentes_trabajo` — **sin prefijo de módulo en el nombre** a propósito (tabla compartida); `clinica_id`, `empleado_id`, campos de §1.6. RLS inicial: `has_permission('rrhh', 'CREATE'/'VIEW')`. Cuando se construya SG-SST, su migración solo necesita **agregar** una condición OR a la policy existente (`has_permission('sgsst', ...)`) — mismo patrón ya usado para `clinicas_select_super_admin` (policies PERMISSIVE se combinan con OR), nunca reemplazar la policy de RRHH.
- `comprobantes_planilla_clinica` — un registro por clínica por mes.
- `periodos_nomina` + `comprobantes_nomina` (categoría laboral) — append-only tras confirmar.
- `comprobantes_honorarios` (categoría servicios) — append-only, incluye `soporte_seguridad_social_storage_path` nullable.
- `documentos_normativos` — **sin prefijo de módulo**, misma razón que `accidentes_trabajo`. `categoria` (rrhh/sgsst/habilitacion), versionado (nueva fila por versión, `vigente` calculado como la de mayor `fecha_vigencia` por nombre).

### 3.3 Mecanismo país-agnóstico

`clinicas.pais_operacion_id` (FK al catálogo global `paises` **ya existente**, usado hoy para nacionalidad de pacientes — no se crea un catálogo nuevo). Un helper `esColombia(clinica)` (mismo criterio que `agenciaRegulatoria` de `proveedores_insumos_invima`) distingue las dos capas de §1.9:

- **Generalidades (EPS/fondo de pensión/fondo de cesantías/ARL/clase de riesgo/banco)**: siempre visibles para cualquier país, con su combobox filtrado por `pais_operacion_id` del catálogo correspondiente (ver §3.1) — nunca se ocultan solo por no ser Colombia. Si el país no tiene entidades sembradas todavía, el combobox simplemente aparece vacío (generalidad capturable, catálogo pendiente de poblar), no un campo oculto.
- **Cálculo legal colombiano (nómina laboral completa, honorarios con retención, acumulado de vacaciones por la fórmula del Art. 186 CST, split de pago de incapacidades, exoneración de aportes, tarifa ARL)**: solo se activa cuando `esColombia(clinica) === true`. Para cualquier otro país, el sistema sigue permitiendo registrar vacaciones/incapacidades/historial de cargo-salario como datos (generalidad estadística, sin el cálculo automático colombiano), y el módulo de Nómina queda sin ofrecerse hasta que se construya el cálculo específico de ese país.

### 3.4 Seguridad y permisos

**Corrección de diseño** (el permiso `VIEW_NOMINA`/`CREATE_NOMINA` que se había esbozado era un código ad-hoc que no sigue el estándar del proyecto — el catálogo `permisos` es GLOBAL y fijo (`VIEW`/`CREATE`/`EDIT`/`DELETE`/`VOID`/`EXPORT`/`IMPORT`, sembrado desde la migración 0001, con su etiqueta en español vía `LABEL_PERMISO` en `permission-matrix-dialog.tsx` — nunca se le agregan códigos nuevos por módulo). La granularidad de "ver documentos sin ver salarios" se logra con **dos módulos separados**, ambos con nombre en español como el resto del proyecto (`pacientes`, `tratamientos`, `medio_ambiente`, etc.), cada uno usando los permisos estándar ya existentes:

- Módulo `rrhh` — `VIEW`/`CREATE`/`EDIT`/`VOID` sobre empleados, documentos, historial de cargo/salario, incapacidades, vacaciones, accidentes y protocolos.
- Módulo `nomina` — `VIEW`/`CREATE`/`VOID` sobre comprobantes de nómina laboral y de honorarios.

Así un rol puede tener `rrhh` sin `nomina` (gestiona documentación/vacaciones sin ver salarios) o ambos — sin inventar ningún código de permiso nuevo, exactamente como pidió el usuario: mismo estándar que ya se usa en toda la plataforma.
- Todo archivo (documentos de empleado, actas, comprobantes) vía Storage privado + URL firmada de corta duración — nunca bucket público (a diferencia del logo de marca, que sí es público por necesidad de `<img>` en correo; aquí no aplica esa excepción).
- Validación de tipo/tamaño de archivo en servidor, nunca solo en el cliente.
- Ningún cálculo de nómina/retención se recibe del cliente — se recalcula siempre contra `historial_salarios_empleado`/`valores_legales_pais`/`clases_riesgo_arl` en el servidor.

### 3.5 Alertas automáticas (nuevo cron, mismo patrón que `recordatorio_citas_cron`)

Un cron diario adicional (Vercel Cron + Resend) que revisa, por clínica: vacunas vencidas/por vencer (≤30 días), exámenes ocupacionales periódicos próximos, contratos a término fijo próximos a vencer, y accidentes laborales con el plazo de 2 días hábiles a la ARL por vencer o vencido sin marcar `reportado_arl=true` — un correo diario al/los administrador(es) de cada clínica con lo pendiente, igual de tolerante a fallos que el cron ya existente (nunca debe tumbar nada si Resend falla).

### 3.6 Frontend

- Formularios siguen el estándar ya existente: `Dialog` 50%/solo-X, `Combobox` para todos los catálogos, `useCerrarAlExito` + toast, `grid-cols-1 sm:grid-cols-2`, paginación de 20 en los listados de empleados/historial.
- El comprobante de nómina/honorarios se imprime como PDF — mismo patrón ya evaluable con `pdf-lib` (ya instalado, usado en Consentimientos) en vez de buscar una librería nueva.
- Sin técnica de animación especial pedida para este módulo — no se introduce nada nuevo de `tw-animate-css` salvo lo que los `Dialog`/`Tabs` ya heredan por defecto.

---

## 4. Plan de ejecución (planeación)

**Orden de construcción** (una sola entrega, pero con una secuencia interna lógica para no bloquear nada a mitad de camino):

1. **Esquema completo**: migración única (o un pequeño grupo numerado consecutivo) con todas las tablas de §3.2, los catálogos de §3.1, `clinicas.pais_operacion_id`, el módulo `rrhh`(+`nomina`) en RBAC, y el seed de `valores_legales_pais`/`clases_riesgo_arl` para Colombia con los valores 2026 confirmados en este documento (SMLV $1.750.905, auxilio transporte $249.095, UVT $52.374, clases de riesgo I-V con sus tarifas iniciales).
2. **Backend**: server actions por sub-área (empleados, documentos, historial cargo/salario, incapacidades, vacaciones, accidentes, protocolos, nómina laboral, honorarios) — cada una con su propio `requirePermiso` sobre el módulo/nivel correcto.
3. **Frontend**: pantalla `/rrhh` con pestañas (mismo patrón que Medio Ambiente/ficha de paciente), empezando por Empleados (maestro + documentos, lo que todo lo demás referencia), luego Historial/Incapacidades/Vacaciones/Accidentes, luego Protocolos, y al final Nómina/Honorarios (lo más complejo, se beneficia de que el resto ya esté probado).
4. **Cron de alertas** (§3.5) — depende de que Empleados/Accidentes ya existan con datos reales para probarlo.
5. **QA + seguridad**: verificación de que un contrato "servicios" nunca puede generar un registro de vacaciones/nómina laboral (constraint a nivel de aplicación y, si es barato, también un `check` en base de datos), y de que el permiso de "ver documentos" no exponga salarios.
6. **Documentación/memoria**: registrar en `TASKS.md` y memoria el diseño final, especialmente el mecanismo de tablas compartidas con SG-SST para que no se reconstruya por accidente cuando llegue ese módulo.

**Explícitamente fuera de alcance de esta entrega** (para que no haya scope creep silencioso):
- Cálculo automático de retención en la fuente salarial (procedimiento 1/2, tablas UVT).
- Bloqueo duro de pago de honorarios por falta de soporte de seguridad social (queda como advertencia).
- Lógica de nómina/legislación específica de México, Perú, República Dominicana o Panamá (solo se preparan los campos generales + el país se puede seleccionar).
- Integración con una pasarela de pago real (el comprobante se genera e imprime; el pago físico/transferencia lo sigue haciendo la clínica por fuera del sistema, igual que hoy con Suscripción).
- Los módulos SG-SST y Habilitación en sí — solo se deja el diseño de `accidentes_trabajo`/`documentos_normativos` listo para que no haya que migrarlos cuando lleguen.

---

## 5. Verificación

1. `tsc --noEmit` + `eslint` limpios.
2. Clínica de prueba desechable: crear un empleado "laboral" (indefinido) y uno "servicios" — confirmar que el primero puede registrar vacaciones/incapacidades/nómina y el segundo NO ve esas pantallas, solo honorarios.
3. Generar un comprobante de nómina de prueba y confirmar a mano los valores calculados (salud, pensión, ARL según clase de riesgo, auxilio de transporte si aplica) contra los porcentajes de este documento.
4. Generar un comprobante de honorarios y confirmar la retención (11%/10% según `declarante_renta`).
5. Confirmar que un rol con solo el permiso de "empleados/documentos" no puede ver `/rrhh` → pestaña Nómina, y que un rol con "nómina" completo sí.
6. Crear una clínica de prueba con `pais_operacion` distinto a Colombia y confirmar que el formulario de empleado oculta EPS/fondo/ARL/clase de riesgo.
7. Simular un accidente laboral con fecha de hace 3 días hábiles sin marcar `reportado_arl` y confirmar que el correo de alerta lo reporta como plazo vencido.
8. Limpiar todos los datos de prueba al terminar — nunca tocar la clínica real de producción (EWAH S.A.S.).
