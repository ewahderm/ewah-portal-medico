# EWAH_APP — Memoria técnica para reconstrucción en Next.js/Vercel + Supabase

> Nota de arquitectura (2026-09-16): este documento describe el sistema legado
> de EWAH SAS (una sola clínica) en Google Apps Script + Sheets. La decisión
> tomada es reconstruirlo como **plataforma SaaS multi-tenant**: EWAH SAS es el
> **primer cliente** de la plataforma, no la única clínica. Por lo tanto, en la
> reconstrucción, toda tabla de negocio de este documento gana una columna de
> aislamiento por clínica (`clinica_id`) que NO existe en el sistema original
> (ahí solo existía una clínica implícita). Ver `supabase/` para el esquema
> multi-tenant real. El resto de este documento se preserva tal cual fue
> escrito, como especificación funcional del dominio (campos, reglas de
> negocio, flujos) — es la fuente de verdad para qué hace cada módulo, no para
> el particionamiento multi-tenant, que se decide aparte.

Sistema de gestión para clínica dermatológica colombiana (EWAH SAS), actualmente en Google Apps Script (GAS) + Google Sheets como BD. Este documento es la especificación funcional/técnica completa para reimplementar en Next.js (Vercel) + Postgres (Supabase). Todo lo "GAS-específico" (Sheets como BD, ScriptCache, Drive, CalendarApp) es un workaround de plataforma — en Postgres/Supabase la mayoría desaparece o se simplifica; se anota dónde.

Convención de este doc: `Tabla(campo1, campo2 FK→Otra.pk, ...)`. Todas las tablas reales tienen además `UsuarioCreador, FechaCreacion, FechaActualizacion` (auditoría) salvo que se indique lo contrario — en Postgres: `created_by uuid, created_at timestamptz default now(), updated_at timestamptz` (trigger). PK siempre es el primer campo listado, `Id<Entidad>`, autoincremental — en Postgres: `serial`/`identity`.

---

## 1. CONFIG GLOBAL (equivalente a AppConfig.js → tabla `app_config` o env vars)

- **Identidad clínica**: razón social, NIT, ciudad, dirección, país, zona horaria (`America/Bogota`), moneda COP.
- **Seguridad**: TTL sesión 28800s (8h), timeout inactividad 14400s (4h), refresh si quedan <1800s, máx 5 intentos login fallidos (**definido pero NO implementado** en el código actual — ver §11).
- **Caché**: TTL dropdowns 600s, TTL tablas 300-3600s (varía por tipo).
- **INVIMA** (regulación dispositivos médicos CO): activo=true, rol actor=Aplicador(3), tipo transacción=Aplicación(3) — usado en reporte INVIMA de biomodelantes.
- **Módulos activos**: 45 flags booleanos (feature flags) — Agenda, Pacientes, Tratamientos, ConsumoInsumos, Inventario, Gastos, CuentasPorCobrar/Pagar, 3×ControlAmbiental, TablasReferencia, Usuarios, ConfigPermisos, ComunicacionesMarketing, Reportes, Auditoria, 8×SGSST, 7×RRHH, 7×Activos(consolidado en 1 UI real), ActasCorporativas, 4×Habilitación, CalendarioRegulatorio. → tabla `modulos.activo` o simplemente env/config JSON.
- **Drive folders** por módulo (SGSST/RRHH/ACTIVOS/ACTAS/HABILITACION/CALENDARIO) — RRHH marcado de alta confidencialidad (nunca compartido públicamente). → buckets de Supabase Storage, uno por módulo, RRHH privado con signed URLs.
- **Sync**: polling cliente cada 15s, TTL estado 60s → reemplazar por Supabase Realtime.
- **IA**: Google Gemini (`gemini-2.0-flash`), asistente activo, captura por voz en módulos [paciente, cita, tratamiento, lote, consumo], max 1024 tokens, temp 0.1.

---

## 2. MODELO DE DATOS COMPLETO

### 2.1 Núcleo clínico
```
Paciente(IdPaciente, IdTipoIdentificacion FK, NumeroIdentificacion [unique], PrimerNombre, SegundoNombre, PrimerApellido, SegundoApellido, FechaNacimiento, IdGenero FK, IdNacionalidad FK→Pais, IdPaisResidencia FK→Pais, IdMedioContacto FK, IdEPS FK, Email, Telefono1, Telefono2)
Tratamiento(IdTratamiento, FechaTratamiento, IdPaciente FK, IdSede FK, Edad, RangoEdad, IdTipoTratamiento FK, IdMedioPago FK, Valor, Observaciones, CUFE)
ConsumoInsumos(IdConsumoInsumos, IdTratamiento FK, IdInsumo FK, IdLote FK, Cantidad, CantidadInvima, SitioAnatomico, Observaciones)  -- APPEND-ONLY, no update/delete
MovimientoInventario(IdMovimientoInventario, IdInsumo FK, IdLote FK, IdTipoMovimientoInventario FK, Cantidad [+ingreso/-egreso], IdTratamiento FK?, IdConsumoInsumo FK?, IdGasto FK?, Observaciones)  -- APPEND-ONLY
LoteInsumo(IdLote, IdInsumo FK, NumeroLote [unique per insumo], FechaVencimiento, CantidadInicial, CantidadDisponible, Estado[activo|agotado|vencido], FechaIngreso, IdProveedor FK, Ubicacion, PrecioUnitario, NumeroFactura, OrigenCreacion, Observaciones)
Cita(IdCita, IdPaciente FK, IdProfesional FK→Usuario, IdConsultorio FK, FechaInicio, FechaFin, DuracionMinutos, Estado, IdTratamiento FK?, Observaciones, GoogleCalendarEventId)
CitaEquipo(IdCitaEquipo, IdCita FK, IdEquipoMedico FK)  -- tabla puente N:M
BloqueoHorario(IdBloqueo, IdProfesional FK, FechaInicio, FechaFin, EsDiaCompleto, Motivo, GoogleCalendarEventId)
```

### 2.2 Financiero
```
Gastos(IdGasto, IdTipoGasto FK, NumeroFactura, FechaFactura, FechaLimitePago, FechaPago, DescripcionGasto, IdProveedor FK, IdMedioPago FK, ValorAntesImpuestos, IVA, ICA, ReteFuente, OtrosImpuestos, ValorTotal, Observaciones)
InsumoCompra(IdInsumoCompra, IdGasto FK, IdInsumo FK, IdLote FK, Cantidad, PrecioUnitario, SubTotal)  -- APPEND-ONLY tras creación (solo eliminable vía deleteGasto con reversión atómica de inventario)
CuentaPorPagar(IdCuentaPorPagar, IdGasto FK, IdProveedor FK, FechaInicio, FechaVencimiento[>FechaInicio], ValorCredito, ValorAbonado, TasaInteres[no usado en cálculo real], Cuotas[metadato], Estado[pendiente|parcial|pagado])
CuentaPorCobrar(IdCuentaPorCobrar, IdTratamiento FK, IdPaciente FK, FechaInicio, FechaVencimiento, ValorCredito, ValorAbonado, TasaInteres, Cuotas, Estado)
```

### 2.3 Inventario/Activos fijos (equipos, no consumibles)
```
ActivoFijo(IdActivo, CodigoActivo, Nombre, Descripcion, IdTipoActivo FK, Marca, Modelo, NumeroSerie, NumeroInventario, FechaAdquisicion, ValorAdquisicion["Valor de Compra"], IdProveedor FK, IdSede FK, Ubicacion, IdEstadoActivo FK, FechaVencimientoGarantia, VidaUtilAnios, FechaProxMantenimiento, RegistroInvima, Observaciones, DriveIdFoto, DriveLinkFoto, NombreFoto,
  Fabricante, PaisOrigen, DireccionProveedor, ValorActual, Depreciacion,
  ClasificacionRiesgo[I|IIA|IIB|III], RequisitosIndicacionesFabricante, MantenimientoIndicadoFabricante,
  PeriodicidadCalibracion[Mensual|Semestral|Anual], PeriodicidadMantenimientoPreventivo, PeriodicidadVerificacion,
  Voltaje, Corriente, Potencia,
  FechaElaboracion, IdEmpleadoElaboracion FK→Usuario, FechaRevision, IdEmpleadoRevision FK→Usuario, FechaAprobacion, IdEmpleadoAprobacion FK→Usuario)
  -- Campos regulatorios/eléctricos/control-documental SOLO se muestran en UI si TipoActivo∈{Equipo Médico,Equipo Biomédico} (regulatorios+control doc) o ∈{+Equipo Cómputo,Equipo Comunicación} (eléctricos) — es un show/hide de UI, no restricción de BD.
DocumentoActivo(IdDocumentoActivo, IdActivo FK, IdTipoDocumentoActivo FK, FechaDocumento, FechaVencimiento, Descripcion, DriveIdArchivo, DriveLinkArchivo, NombreArchivo)  -- 1 activo : N documentos (facturas, certificados INVIMA, etc.)
MantenimientoActivo(IdMantenimiento, IdActivo FK, IdTipoMantenimiento FK, FechaProgramada, FechaRealizacion, Descripcion, Proveedor, ValorMantenimiento, IdTecnico, ProximoMantenimiento, IdEstadoMantenimiento FK, Hallazgos, AccionesRealizadas, Observaciones, DriveIdInforme, DriveLinkInforme, NombreInforme)
  -- side-effect: al guardar con ProximoMantenimiento, sobrescribe ActivoFijo.FechaProxMantenimiento (denormalización).
CalibracionEquipo(IdCalibracion, IdActivo FK, FechaCalibracion, FechaVencimiento, Laboratorio, Acreditacion, NumCertificado, ResultadoCalib, CumpleEspecificaciones[bool], DriveIdCertificado, DriveLinkCertificado, NombreCertificado)
InspeccionInstalacion(IdInspeccionInstalacion, IdTipoInspeccionInstalacion FK, IdSede FK [NO ligado a activo, por diseño], FechaProgramada, FechaRealizacion, EntidadInspectora, Inspector, Resultado, Hallazgos, AccionesRequeridas, FechaProximaInspeccion, EstadoInspeccion, DriveIdConcepto, DriveLinkConcepto, NombreConcepto)
LicenciaPermiso(IdLicencia, IdTipoLicenciaPermiso FK, NumeroLicencia, EntidadExpide, FechaExpedicion, FechaVencimiento, Descripcion, IdResponsable FK→Usuario, DriveIdArchivo, DriveLinkArchivo, NombreArchivo)
SoftwareLicencia(IdSoftware, IdActivo FK?, NombreSoftware, Version, TipoLicencia, NumLicencias, FechaActivacion, FechaVencimiento, Proveedor, ValorAnual, DriveIdLicencia, DriveLinkLicencia, NombreLicencia)
ContratoPrestador(IdContrato, IdTipoContratoActivo FK, IdProveedor FK, Objeto, FechaInicio, FechaFin, ValorMensual, ValorTotal, Contacto, Telefono, IdEstadoContratoActivo FK, Observaciones, DriveIdArchivo, DriveLinkArchivo, NombreArchivo)
```
Regla de borrado `ActivoFijo`: bloqueado si tiene FK en DocumentoActivo/MantenimientoActivo/CalibracionEquipo/SoftwareLicencia (InspeccionInstalacion ya NO aplica, se desligó de Activo).

### 2.4 Ambiental / regulatorio general
```
ControlTemperaturaHumedadConsultorio(Id, IdConsultorio FK, AM_PM, Temperatura, Humedad, FechaMedicion)
ControlTemperaturaNevera(IdControlTemperaturaNevera, IdNevera FK, AM_PM, Temperatura, FechaMedicion)
ControlBasuras(IdControlBasuras, IdCaneca FK, PesoKg, FechaMedicion)
  -- Las 3 tablas se gestionan con UN SOLO motor genérico config-driven (ControlGenericoService.js): objeto TIPOS_CONTROL mapea tipo→{tabla, campoRelacion, camposValor, esCombinado, rangoMin/Max}. Replicar 1:1 en Next.js: función API parametrizada por tipo + tabla de config (código o BD), no 3 endpoints duplicados. Rangos válidos: basuras 0.01–100kg; temp nevera −50/50°C; temp consultorio −50/100°C; humedad 0–100%.
CalendarioRegulatorio(IdCalendarioRegulatorio, Entidad, TipoObligacion, NombreReporte, DescripcionReporte, FechaLimite, Periodicidad, RequiereFirmaDigital, Estado, FechaPresentacion, ResponsablePresentacion, Observaciones)
CalendarioRegulatorioDoc(IdCalRegDoc, IdCalendarioRegulatorio FK, NombreDocumento, TipoDocumento, FechaDocumento, DriveId, DriveLink, FileName, MimeType, Observaciones)
```

### 2.5 Marketing
```
ComunicacionMarketing(IdComunicacion, IdPaciente FK, IdTipoObjetivoComunicacion FK, IdMedioComunicacion FK, IdCampana FK, FechaPrimerContacto, FechaSegundoContacto, FechaTercerContacto, OportunidadPerdida[bool], AgendamientoCerrado[bool], FechaAgendamiento, Observaciones)
```

### 2.6 SGSST (Seguridad y Salud en el Trabajo — normativa laboral CO)
```
DocumentoSGSST(IdDocumento, Codigo, Titulo, IdTipoDocumentoSGSST FK, Version[texto libre, sin versionado real], IdProcesoSGSST FK, IdEstadoDocumentoSGSST FK, FechaEmision, FechaVigencia, FechaProximaRevision, Objetivo, Alcance, IdResponsableElaboracion FK→Usuario, IdResponsableAprobacion FK→Usuario, Observaciones, DriveIdArchivo, DriveLinkArchivo, NombreArchivo)
EventoSGSST(IdEvento, Titulo, IdTipoEventoSGSST FK, IdComiteSGSST FK, FechaProgramada, FechaRealizacion, HoraInicio, HoraFin, Lugar, IdResponsable FK→Usuario, Participantes, Descripcion, IdEstadoEventoSGSST FK, EsObligatorioARL[bool], EsObligatorioMTE[bool], Observaciones, +Drive×3)
ActaSGSST(IdActa, NumeroActa, IdComiteSGSST FK, IdEventoSGSST FK, FechaActa, Asistentes, PuntosAgenda, Compromisos, Conclusiones, ProximaReunion, EstadoActa, +Drive×3)
CompromisoSGSST(IdCompromiso, IdActa FK, Descripcion, IdResponsable FK→Usuario, FechaCompromiso, FechaCumplimiento, IdEstadoCompromisoSGSST FK, Observaciones, +DriveEvidencia×3)
IncidenteSGSST(IdIncidente, NumeroReporte, IdTipoIncidenteSGSST FK, FechaIncidente, HoraIncidente, LugarIncidente, IdTrabajador FK→Usuario, DescripcionIncidente, CausaInmediata, CausaBasica, AccionesCorrectivas, FechaSeguimiento, ReportadoARL[bool], FechaReporteARL, IdEstadoIncidenteSGSST FK, Observaciones, +Drive×3)
CapacitacionSGSST(IdCapacitacion, Tema, IdTipoCapacitacionSGSST FK, IdEventoSGSST FK?, FechaCapacitacion, DuracionHoras, Instructor, Asistentes, NumeroAsistentes, Objetivo, Observaciones, +Drive×3)
InspeccionSGSST(IdInspeccion, Titulo, IdTipoInspeccionSGSST FK, FechaInspeccion, IdInspector FK→Usuario, AreaInspeccionada, Hallazgos, AccionesCorrectivas, FechaSeguimiento, EstadoInspeccion, IdActivo FK?, Observaciones, +Drive×3)
CumplimientoLegalSGSST(IdCumplimiento, IdNormaLegalSGSST FK, ArticuloAplicable, DescripcionRequisito, IdResponsable FK→Usuario, FechaVerificacion, FechaProximaVerificacion, IdEstadoCumplimientoSGSST FK, Observaciones, +DriveEvidencia×3)
```
Jerarquía: `EventoSGSST → ActaSGSST → CompromisoSGSST` (borrado bloqueado si hay hijos, sin cascada). Vencimiento genérico: `ProximoVencer` = vence en ≤30 días (calculado en request, no persistido) — patrón repetido en casi todos los módulos con fecha de vigencia.

### 2.7 RRHH
```
ExpedienteEmpleado(IdExpediente, IdEmpleado FK→Usuario [1 expediente activo por empleado], TipoContrato, FechaIngreso, FechaRetiro, Cargo, IdSede FK, TipoJornada, Salario, IdAFP FK, IdEPS FK, IdARL FK, IdCajaCompensacion FK, FechaExamenIngreso, FechaExamenPeriodico, FechaExamenEgreso [denormalizados, actualizados automáticamente al crear ExamenOcupacional según tipo], Estado[…|Retirado], Observaciones)
DocumentoEmpleado(IdDocumentoEmpleado, IdEmpleado FK, IdTipoDocumentoRRHH FK, FechaDocumento, FechaVencimiento, Descripcion, +Drive×3)
IncapacidadEmpleado(IdIncapacidad, IdEmpleado FK, FechaInicio, FechaFin, DiasIncapacidad[auto-calculado si falta = (fin−inicio)/día+1], IdTipoIncapacidad FK, DiagnosticoCIE10, Entidad, Prorroga[bool], FechaProrrogaFin, DiasAcumulados, EstadoReembolso, +Drive×3)
PlanillaSegSocial(IdPlanilla, PeriodoPago[YYYY-MM, unique], FechaPago, ValorTotal, ValorSalud, ValorPension, ValorARL, ValorCajaCompensacion, NumEmpleados, EntidadPagadora, NumeroPILA, IdEstadoPlanillaRRHH FK, +Drive×3)
NominaEmpleado(IdNomina, IdEmpleado FK, PeriodoPago, FechaPago, SalarioBase, Devengado, Deducciones, NetoPagado [todos calculados EXTERNAMENTE, sin motor de liquidación], IdFormaPagoNomina FK, +Drive×3)
VacacionEmpleado(IdVacacion, IdEmpleado FK, FechaInicio, FechaFin, DiasHabiles, TipoDisfruteVac, EstadoVacacion, Observaciones, +Drive×3)
ExamenOcupacional(IdExamen, IdEmpleado FK, IdTipoExamenOcupacional FK[1=ingreso,2=periódico,5=egreso — IDs mágicos], FechaExamen, Resultado, Restricciones, FechaVigencia, Medico, IPS, +Drive×3)
EvaluacionDesempeno(IdEvaluacion, IdEmpleado FK, PeriodoEvaluado, Calificacion, Fortalezas, Oportunidades, PlanMejora, IdEvaluador FK→Usuario, +Drive×3)
```
Borrado `ExpedienteEmpleado` bloqueado si tiene hijos en las 6 tablas (por `IdEmpleado`, no `IdExpediente`) — sugiere marcar `Estado='Retirado'` en vez de borrar.

### 2.8 Habilitación (Res. 3100/2019 — habilitación de sedes en salud CO)
```
HabSedes(IdSede, NombreSede, IdTipoHabilitacion FK, CodigoREPS, Direccion, Municipio, Departamento, Telefono, Email, FechaInscripcion, FechaVencimiento, EstadoREPS, Observaciones)
HabCriterios(IdCriterio, Capitulo, NombreCapitulo, NumeroEstandar, NombreEstandar, GrupoServicio, NombreGrupo, CodigoCriterio, DescripcionCriterio, AplicaIPS[bool], AplicaProfesional[bool], Obligatorio[bool], Complejidad, Modalidad, Orden)  -- catálogo legal fijo, solo lectura, seed versionado
HabChecklist(IdChecklist, IdSede FK, IdCriterio FK, Aplica[bool], IdEstadoCumplimientoHab FK, FechaVerificacion, Responsable, Hallazgo, AccionCorrectiva, Observaciones)  -- 1 fila por sede×criterio, auto-generado al crear sede (instanciar_checklist)
HabDocumentos(IdDocumento, IdChecklist FK, NombreDocumento, IdTipoDocumentoHab FK, FechaDocumento, FechaVencimiento, IdEstadoSometimiento FK, NombreArchivo, DriveId, DriveLink, Observaciones)
HabCertificados(IdCertificado, IdSede FK, IdTipoCertificadoHab FK, Servicio, NumeroActo, FechaExpedicion, FechaVencimiento, EntidadExpide, EstadoVigencia, NombreArchivo, DriveId, DriveLink, Observaciones)  -- ventana "próximo a vencer" = 90 días (distinto de los 30 del resto del sistema)
```
`HabCriterios` es un catálogo legal que puede cambiar de versión — requiere migraciones versionadas (en GAS hay funciones de "reparación" manual; en Postgres: migraciones + FK ON DELETE CASCADE resuelven esto nativamente).

### 2.9 Actas corporativas
```
ActaCorporativa(IdActa, IdTipoActaCorporativa FK, IdEstadoActaCorporativa FK, NumeroActa, Titulo, FechaActa, LugarReunion, Participantes, PuntosAgenda, Compromisos, Conclusiones, Firmada[bool, sin firma electrónica real], +Drive×3)
```

### 2.10 Sistema (auth/RBAC/auditoría)
```
Usuario(IdUsuario, Usuario[username, unique], Nombre, Email[unique], Password[⚠️texto plano, ver §11], IdRol FK, UltimoAcceso, IntentosLogin, Bloqueado[bool], FechaBloqueo, RequiereCambioPass, IdUsuarioCreador)
Rol(IdRol, NombreRol, Descripcion, Nivel[1=Admin→bypass total RBAC], Activo)
Modulo(IdModulo, NombreModulo, Codigo[unique, usado en routing], Descripcion, Ruta, Icono, Orden, EsAdministrativo, Activo)
Permiso(IdPermiso, NombrePermiso, Codigo[VIEW|CREATE|EDIT|DELETE|EXPORT|IMPORT|APPROVE|VOID], Descripcion, Activo)
RolModuloPermiso(IdRolModuloPermiso, IdRol FK, IdModulo FK, IdPermiso FK, Concedido[bool])  -- ausencia de fila = denegado; PK compuesta lógica (rol,modulo,permiso)
SesionUsuario(IdSesion, IdUsuario FK, FechaInicio, FechaFin, IP, Navegador, DispositivoTipo, Activa[bool])
LogAcceso(IdLog, IdUsuario FK, IdModulo FK, Accion, Recurso, Exitoso[bool], MensajeError, FechaHora, IP)  -- purga automática >1 mes
```

### 2.11 Tablas de referencia (catálogos simples, patrón uniforme: `Id<X>, <X>` + auditoría; se listan solo nombre)
TipoIdentificacion(+CodigoTipoIdentificacion), Pais, Sede, MedioContacto, TipoTratamiento, Genero, MedioPago, Consultorio, Caneca, Nevera, TipoMovimientoInventario, TipoIngreso, TipoGasto, UnidadMedida, EPS, TipoObjetivoComunicacion, MedioComunicacion, EquipoMedico(+Descripcion,Activo), TipoActivo, EstadoActivo, TipoMantenimiento, EstadoMantenimiento, TipoInspeccionInstalacion, TipoDocumentoActivo, TipoLicenciaPermiso, TipoContratoActivo, EstadoContratoActivo, TipoActaCorporativa, EstadoActaCorporativa, TipoHabilitacion, TipoDocumentoHab, EstadoSometimiento, EstadoCumplimientoHab, TipoCertificadoHab, EntidadReguladora, TipoObligacion, EstadoObligacion, PeriodicidadObligacion, TipoDocumentoSGSST, ProcesoSGSST, EstadoDocumentoSGSST, TipoEventoSGSST, EstadoEventoSGSST, ComiteSGSST, TipoIncidenteSGSST, EstadoIncidenteSGSST, TipoCapacitacionSGSST, TipoInspeccionSGSST, EstadoCumplimientoSGSST, EstadoCompromisoSGSST, NormaLegalSGSST(+Descripcion,Entidad,Anio), TipoDocumentoRRHH, TipoIncapacidad, TipoContrato, TipoJornada, AFP, ARL, CajaCompensacion, TipoExamenOcupacional, EstadoPlanillaRRHH, FormaPagoNomina.

**Con estructura propia** (no genérica):
```
Insumo(IdInsumo, Insumo[nombre], IdUnidadMedida FK, IdUnidadMedidaInvima FK, IdProveedor FK, RegistroInvima, FechaFinInvima, ReferenciaReportada, PresentacionComercialReportada, ReporteInvima[bool, filtra qué insumos van al reporte INVIMA])
Proveedor(IdProveedor, IdTipoIdentificacion FK, NumeroIdentificacion, Proveedor[nombre], Observaciones)
ConfiguracionInvima(IdConfiguracionInvima, TipoUsuario, TipoDocumento, NumeroDocumento, RolActor, TipoTransaccion, Departamento, Ciudad, DireccionAlmacenamientoProducto, CodigoHabilitacion)  -- registro único de config institucional para reporte INVIMA
CampanaMarketing(IdCampana, NombreCampana, Descripcion, FechaInicio, FechaFin, Activo)
```

---

## 3. AUTH & SESIONES

**Estado actual (GAS)**: login propio (no OAuth) — `Usuario/Email` + `Password` **texto plano**, comparación `===` directa. Genera token random (32 chars + timestamp), sesión guardada en cache server-side `sesión→{IdUsuario,email,nombre,idRol,lastActivity}` con TTL 8h deslizante (se renueva en cada `checkSession` si actividad <4h). Login además: purga sesiones expiradas, inserta fila en `SesionUsuario`, actualiza `UltimoAcceso`. Logout: cierra TODAS las sesiones activas del usuario + purga logs >2 meses.

**Migración → Supabase Auth**: usar Supabase Auth nativo (email+password con hash automático) — resuelve el problema crítico de passwords en texto plano. Sesión = JWT de Supabase (cookies httpOnly), sin necesidad de tabla de sesiones custom ni token cache-based. Middleware Next.js valida sesión en cada request a rutas protegidas. Mantener `SesionUsuario`/`LogAcceso` como tablas de auditoría de negocio (no como mecanismo de auth) con purga vía `pg_cron`.

**Reglas de negocio a decidir/completar en el rediseño** (existen en el modelo de datos actual pero NO se ejecutan):
- Bloqueo de cuenta tras 5 intentos fallidos (`Usuario.IntentosLogin`/`Bloqueado` existen, no se usan).
- Single-session-per-usuario (hay 2 implementaciones divergentes en el código legado: una la aplica, otra no — decidir cuál es el comportamiento deseado y aplicarlo consistentemente).

---

## 4. RBAC (Rol × Módulo × Permiso)

Modelo: `Rol` 1:N `RolModuloPermiso` N:1 `Modulo`, N:1 `Permiso`. Ausencia de fila = permiso denegado (no hay "deny" explícito). `Rol.Nivel===1` (Administrador) = bypass total, sin consultar la matriz. Función clave: `tienePermiso(modulo, permiso)`.

**Roles actuales** (Nivel, ejemplos de configuración): 1=Administrador(bypass), 2=Director Médico(gestión sin delete en clínico+activos), 3=Médico, 4=Asistente Médico, 5=Recepcionista, 6=Contador(RRHH financiero), 7=Auxiliar Inventario(VIEW/CREATE/EDIT en Activos+Instalaciones), 8=Solo Lectura(VIEW global), 9=Responsable SGSST(pleno en SGSST + VIEW en Activos), 10=Responsable RRHH(pleno en RRHH + VIEW SGSST), 11=Jefe de Mantenimiento(pleno en Activos+Instalaciones+Licencias+Contratos).

**Migración**: tablas Postgres idénticas + RLS policies basadas en `auth.uid() → usuario.id_rol → rol_modulo_permiso`. Función `has_permission(modulo_code, permiso_code)` como Postgres function/RPC reusable en RLS y en middleware. Códigos de módulo (`Modulo.Codigo`) = string estable usado en routing (`/app/(protected)/<codigo>/page.tsx`), igual que hoy en `CODE.js`.

**Nota de consolidación de UI**: varios módulos legacy de "Activos" (Dashboard/Inventario/Mantenimiento/Calibración, IDs históricos) se consolidaron en UNA sola pantalla con tabs (`ActivosGestion`) — los códigos viejos quedan como alias de ruta hacia la nueva, y sus registros de módulo se marcan inactivos pero no se borran (preserva histórico de `LogAcceso`). Instalaciones/Licencias/Contratos quedan como pantallas independientes (no se consolidan porque su relación de datos es distinta: Instalaciones se liga a Sede, no a Activo).

---

## 5. CAPA DE DATOS Y CACHÉ (patrón GAS a reemplazar, no a replicar)

**GAS actual**: `CRUDService.js` es un ORM casero sobre Sheets (`getAllRecords/getRecordById/createRecord/updateRecord/deleteRecord/searchRecords*`, todo full-scan en memoria tras traer de caché o Sheets; ID autoincremental = última_fila+1, sin `MAX()` real, sin locks → riesgo de colisión). `CacheService.js` envuelve `ScriptCache` (límite real 100KB/entrada) con **fragmentación automática (chunking)** para tablas grandes (ej. `RolModuloPermiso` creció y superó el límite): parte el JSON en fragmentos de 90KB + una entrada de metadata con el conteo, reconstruye al leer; si falta un fragmento (expiró), trata como cache-miss completo. Invalidación (`invalidateTableCache`) expande a los posibles fragmentos antes de borrar. Hay además un "token de versión" global (`cache_version`) que los clientes comparan contra su copia en localStorage para decidir si recargar dropdowns — con lista hardcodeada de qué tablas alimentan qué dropdowns compuestos.

**Migración**: TODO esto desaparece en Postgres. IDs → `serial`/`identity`. Queries → SQL con `WHERE`/`JOIN`/`LIMIT` reales (no traer todo y filtrar en memoria). El "cache_version + polling de invalidación" → **Supabase Realtime** (subscripción a cambios de tabla, push real, sin polling) o simplemente React Query/SWR con `revalidateOnFocus`. Si se necesita cache de queries pesadas, usar Vercel KV/Redis sin ningún límite de tamaño ni fragmentación. Operaciones multi-paso (crear registro + actualizar stock + crear movimiento) **no son transaccionales en GAS** (solo `try/catch` con warning, sin rollback) — en Postgres envolver en transacciones (`BEGIN/COMMIT`) o funciones RPC/triggers para garantizar atomicidad real (mejora respecto al sistema actual, no solo migración 1:1).

---

## 6. SYNC ENTRE CLIENTES

GAS: polling cada 15s a `getSyncStatus()`, compara `cache_version` + payload del último cambio (`{tabla,accion,usuario,timestamp}`) contra lo último visto en localStorage; sin estado por-cliente en servidor. → **Reemplazar por Supabase Realtime** (Postgres logical replication → WebSocket, suscripción a `postgres_changes` por tabla/canal) — elimina el polling y el concepto de "versión global" por completo.

---

## 7. LOGGING Y AUDITORÍA

Dos sistemas separados a mantener conceptualmente distintos:
- **Log de aplicación** (debug/errores, no persiste en BD): niveles ERROR/WARNING/INFO/DEBUG → reemplazar por logger estructurado (pino) + Sentry/Vercel Observability.
- **Auditoría de negocio** (`SesionUsuario`, `LogAcceso`, persiste en BD, consultable por admin en pantalla Auditoría): registra login/logout, acceso a módulos, operaciones CRUD. Purga: logs >1 mes, sesiones >2 meses — en GAS es "probabilística" (2% de las escrituras dispara limpieza, housekeeping para evitar costo fijo en Sheets API) o manual en cada logout; en Postgres usar `pg_cron` diario con `DELETE ... WHERE fecha < now() - interval`. Filtrado/paginación de auditoría hoy es 100% en memoria (trae todo) → usar `WHERE`/`LIMIT`/`OFFSET` SQL reales.

---

## 8. LÓGICA DE NEGOCIO POR DOMINIO

### 8.1 Pacientes
CRUD con validaciones (identificación única, formato email/teléfono CO laxo — no hay checksum real de cédula/NIT). Búsqueda in-memory normalizando texto (lower+NFD+strip diacríticos). `Edad`/`RangoEdad` son columnas **materializadas** (recalculadas y guardadas en cada save a partir de `FechaNacimiento`, no derivadas on-the-fly) — mismo patrón en `Tratamiento` (edad calculada del paciente relacionado, no propia). Borrado bloqueado si tiene `Tratamiento` asociados.

### 8.2 Tratamientos
CRUD + filtros combinables (profesional/sede/paciente/tipo/rango fecha). Efecto secundario: si `IdMedioPago` cambia de "Crédito"→otro, borra automáticamente la `CuentaPorCobrar` asociada; el caso inverso (otro→Crédito) NO crea cuenta automáticamente (queda manual, a diferencia del flujo de Gastos que sí es simétrico — ver 8.9). Borrado bloqueado si tiene `ConsumoInsumos` asociados (y estos son append-only → en la práctica, indeletable si tuvo consumo).

### 8.3 Agenda (Cita/BloqueoHorario/CitaEquipo)
Validación de conflictos de horario (solapamiento `inicio<finB && fin>inicioB`) contra: mismo profesional, mismo consultorio, mismo equipo médico (vía tabla puente), y contra `BloqueoHorario` del profesional — se valida en ese orden, primer conflicto encontrado bloquea. Citas `Cancelada` se excluyen de la validación. **Integración Google Calendar**: unidireccional (app→Calendar), best-effort (nunca bloquea la operación principal, solo loguea warning si falla), usa `CalendarApp` nativo sobre el calendario default de la cuenta que ejecuta el script; guarda `GoogleCalendarEventId` tras crear; en update solo actualiza el evento si ya existía ese Id (no crea uno nuevo); en delete borra el evento por Id. Conversión horaria hardcodeada a UTC-5 (Bogotá, sin DST). **Sin locking de concurrencia** — dos requests simultáneos podrían crear citas solapadas (recomendado en Postgres: `EXCLUDE USING gist` sobre rango de tiempo + profesional/consultorio/equipo). Migración GCal: Google Calendar API v3 desde API route/Edge Function, mismo patrón fire-and-forget.

### 8.4 ConsumoInsumos (consumo de insumos durante tratamiento)
`createConsumoInsumo`: valida disponibilidad del lote elegido (existe, `Estado==='activo'`, `CantidadDisponible>=cantidad`) → crea el registro → descuenta `LoteInsumo.CantidadDisponible` (marca `agotado` si llega a 0) → crea automáticamente `MovimientoInventario` de egreso vinculado (`Cantidad` negativa, tipo fijo "Egreso-Consumo en Tratamiento", enlaza `IdConsumoInsumo`+`IdTratamiento`). **Sin transacción real** — si el paso de stock/movimiento falla tras crear el consumo, solo se loguea warning (posible inconsistencia). `updateConsumoInsumo`/`deleteConsumoInsumo` **siempre rechazan** — el consumo es append-only por diseño; corrección de errores = crear un `MovimientoInventario` de tipo Ajuste aparte (no expuesto por este servicio). FEFO: el backend NO fuerza selección del lote más próximo a vencer, solo lo presenta ordenado así al frontend (disciplina depende del usuario).

### 8.5 Inventario (MovimientoInventario, genérico)
`createMovimientoInventario`: si trae `IdLote`, valida pertenencia al insumo y saldo suficiente si es egreso (`Cantidad<0`), actualiza `CantidadDisponible` del lote (con transición automática de `Estado` agotado↔activo); si NO trae `IdLote`, es un movimiento "global" que no toca ningún lote. `update`/`delete` de movimientos **siempre rechazados** (append-only, igual patrón que ConsumoInsumos — corrección = nuevo movimiento de Ajuste). Saldo global por insumo = **recalculado sumando TODOS los movimientos históricos** cada vez que se pide (no hay columna de saldo materializada) — costoso a escala; en Postgres: vista materializada o trigger que mantenga un saldo agregado. Snapshot histórico (`calcularInventarioACorte`) = mismo cálculo filtrando movimientos hasta una fecha.

### 8.6 LoteInsumo (stock físico por lote, FEFO, vencimientos)
`createLoteInsumo`: valida `NumeroLote` único por insumo, `FechaVencimiento>=hoy`, `CantidadInicial>0` → crea lote (`CantidadDisponible=CantidadInicial`, `Estado='activo'`) → crea automáticamente `MovimientoInventario` de ingreso (tipo "Ingreso-Compra" o "Ingreso-Saldo Inicial" según `OrigenCreacion`). `getLotesActivosPorInsumo` = función FEFO real: filtra activos+no vencidos+stock>0, calcula alertas de vencimiento (crítico ≤90d, próximo ≤180d) y de stock (crítico ≤10%, bajo ≤30%), **ordena ascendente por fecha de vencimiento** (primero-en-vencer-primero). `marcarLotesVencidos()`: job que pasa lotes `activo` con `FechaVencimiento<hoy` a `Estado='vencido'` (NO afecta `CantidadDisponible`, solo bloquea su uso futuro al excluirlo del filtro `activo`) — requiere un **trigger diario cron** (GAS: `ScriptApp` time-based trigger 1am, requiere activación manual una vez; Postgres: `pg_cron` diario `UPDATE ... WHERE estado='activo' AND fecha_vencimiento<now()`). Transiciones de `Estado`: activo↔agotado (por cantidad, reversible), activo→vencido (por cron, sin reversa).
⚠️ **Duplicación de lógica a unificar en el rediseño**: ConsumoInsumosService, InventarioService y GastosService cada uno actualiza `LoteInsumo.CantidadDisponible` **directamente** en vez de llamar a una función central (`LoteInsumoService.actualizarCantidadLote` existe pero no se usa desde los otros 2). Recomendación fuerte: una sola función/RPC Postgres `fn_ajustar_stock_lote(id_lote, delta)` llamada por los 3 flujos.

### 8.7 Gastos (compras/egresos) — módulo modificado extensamente en la sesión que originó este doc
`createGasto`: valida fecha+valor → crea → si `esCredito=true`, crea automáticamente `CuentaPorPagar` (ValorCredito=ValorTotal, Estado='pendiente'); si falla la cuenta, el gasto queda igual creado con advertencia. `updateGasto`: detecta cambio de medio de pago crédito↔otro por nombre normalizado; crédito→otro borra la cuenta (sin validar abonos, vía función "administrativa" que bypassa esa regla); otro→crédito crea la cuenta (a diferencia de Tratamientos, aquí SÍ es simétrico en ambas direcciones).
`addInsumoToCompra`: **todo insumo agregado a un gasto mueve inventario automáticamente y exige lote** (obligatorio, no opcional) → crea línea `InsumoCompra` (append-only) → crea `MovimientoInventario` de ingreso (tipo "Ingreso-Compra") → actualiza el lote directamente (mismo problema de duplicación del §8.6).
`deleteGasto(id, revertirInventario)` — algoritmo con reversión atómica opcional:
1. Si tiene `InsumoCompra`: sin `revertirInventario` → bloquea. Con `revertirInventario=true` → **valida saldo suficiente en TODOS los lotes ANTES de tocar cualquiera** (todo-o-nada), luego por cada línea crea un movimiento de Ajuste-Egreso (cantidad negativa) y borra la línea.
2. Si tiene `CuentaPorPagar`: bloquea **siempre**, incondicionalmente — debe borrarse antes desde Cuentas por Pagar (que a su vez solo permite si `ValorAbonado=0`).
3. Si pasa ambos, borra el gasto.
`removeInsumoFromCompra` (eliminar 1 línea suelta): **siempre rechaza** — solo se puede quitar un insumo vía el flujo completo de `deleteGasto` con reversión. Dependencia de nombres string en `TipoMovimientoInventario` ("Ingreso - Compra", "Salida - Ajuste"/"Egreso - Ajuste") — matching por texto normalizado, frágil ante renombres del catálogo (usar enum/slug estable en el rediseño).

### 8.8 Cuentas por Pagar / Cobrar
Créditos simples sin motor de amortización real: `TasaInteres`/`Cuotas` son metadatos informativos guardados tal cual, no se usan para calcular cuotas ni interés compuesto. `registrarAbono`: suma (o resta, para corrección) al `ValorAbonado`; Cuentas por Cobrar valida que no exceda `ValorCredito` (Cuentas por Pagar NO tiene ese tope, asimetría a decidir si es intencional); recalcula `Estado` (pendiente/parcial/pagado) por umbral; **historial de abonos se concatena como texto con timestamp dentro de `Observaciones`** — no hay tabla de abonos separada (en el rediseño: crear tabla `abono(id, cuenta_id, valor, fecha, observacion, usuario)` para trazabilidad real). Borrado de cuenta bloqueado si `ValorAbonado>0` (única vía de bypass: borrado en cascada desde cambio de medio de pago en Gastos/Tratamientos, que no valida esto — inconsistencia a resolver).

### 8.9 TablasReferencia (motor genérico de catálogos)
CRUD dispatch por nombre de tabla: casos especiales (Usuario, Insumo, Proveedor, TipoIdentificacion, ConfiguracionInvima) con mapeo de campos propio; el resto (catálogos simples de 1 campo) usa patrón genérico `campoValor = config.fields[1]`. Antes de borrar cualquier registro de referencia, `verificarRegistroEnUso` consulta un **mapa estático hardcodeado** de `{tabla_referencia: [{tabla_hija, campo_fk}, ...]}` cubriendo todo el dominio (clínico+SGSST+RRHH+Activos) — si una tabla nueva no se agrega a este mapa, no queda protegida. **En Postgres esto se reemplaza directamente por FK constraints con `ON DELETE RESTRICT`** (integridad referencial nativa) — mantener el mapa solo, opcionalmente, para traducir el error de violación de FK a un mensaje amigable ("usado en: Gastos (3), Insumo (12)").

### 8.10 Reportes
Todo de solo lectura/agregación (KPIs clínicos/financieros por rango de fecha+profesional+sede, ventas por profesional/tendencia/top tratamientos/por país, pivote año×mes, ambientales, comisiones por tramos de venta mensual hardcodeados: <$50M→0%, $50-59.9M→3%, $60-79.9M→4%, ≥$80M→5%). **Reporte INVIMA de biomodelantes** (regulatorio CO, sustancias de relleno): cruza ConsumoInsumos+Tratamiento+Paciente+Insumo(solo `ReporteInvima=true`)+LoteInsumo+Proveedor contra 1 registro de `ConfiguracionInvima` institucional; exporta a XLSX (ver §9). Nota: hay una función de resumen financiero que quedó desactualizada tras el rename Compras→Gastos (lee nombres de hoja/campo antiguos) — no replicar el bug, usar el modelo actual de `Gastos`.

### 8.11 Activos e Instalaciones (módulo consolidado en UI con tabs — el más recientemente rediseñado)
UI consolidada `ActivosGestion` con 4 tabs: **Dashboard** (KPIs+alertas globales), **Inventario** (CRUD `ActivoFijo`, con botón "Ficha" que abre modal de trazabilidad), **Mantenimientos**, **Calibraciones** (listados globales, cruzan cualquier activo). **Ficha del Activo** = vista de detalle con sub-tabs: Mantenimientos/Calibraciones filtrados a ESE activo + **Documentos** (CRUD nuevo de `DocumentoActivo`, N documentos por activo, backend ya existía pero no tenía UI). Campos de `ActivoFijo` regulatorios/eléctricos/control-documental se muestran condicionalmente según `TipoActivo` (ver §2.3). Export a **PDF** de la ficha completa (para impresión/auditoría): genera documento con secciones (identificación, fabricante, adquisición, ubicación, regulatorios si aplica, eléctricos si aplica, historial de mantenimientos/calibraciones/documentos, tabla de control documental Elaboró/Revisó/Aprobó con líneas de firma). Instalaciones/Licencias/Contratos quedan como pantallas independientes (Instalaciones ligada a Sede, no a Activo — ver §2.3).

### 8.12 SGSST / RRHH / Habilitación / Actas / Calendario Regulatorio / Marketing
Mayormente CRUD con: validación de integridad referencial manual antes de borrar (jerarquías Evento→Acta→Compromiso; Expediente→6 tablas hijas), cálculo de flags `Vencido`/`ProximoVencer` sobre fechas de vigencia (ventana de 30 días en la mayoría, 90 días en certificados de Habilitación — inconsistencia a unificar), adjuntos Drive opcionales por registro, exportación XLSX. RRHH-específico: nómina/planilla son solo registro histórico de valores ya calculados externamente (NO hay motor de liquidación colombiana — parafiscales, retención, horas extra quedan fuera de alcance actual). Habilitación: `HabChecklist` se auto-genera (1 fila por criterio legal) al crear una sede nueva; tiene funciones de "reparación" de datos para cuando el catálogo `HabCriterios` cambia de versión (en Postgres: migraciones versionadas + `ON DELETE CASCADE` lo resuelven sin necesidad de scripts de reparación). Usuarios: reglas críticas a preservar — no se puede auto-eliminar, no se puede eliminar al último Administrador del sistema (`Rol.Nivel=1`), password opcional en edición (solo se cambia si viene valor nuevo).

### 8.13 Asistente IA (Google Gemini)
Dos funciones: (a) consultas en lenguaje natural sobre datos del sistema — router por keywords (regex, sin LLM) hacia funciones que arman la respuesta con lógica JS pura sobre las tablas; si no matchea ninguna categoría, cae a pregunta libre respondida por Gemini. (b) **captura de datos por voz multi-turno**: transcripción→Gemini con schema declarativo por módulo (paciente/cita/lote/consumo/tratamiento) + opciones válidas de cada dropdown inyectadas en el prompt → LLM devuelve JSON `{camposExtraidos, camposFaltantes, completo, preguntaSeguimiento}` hasta completar todos los campos requeridos → al completar, llama las funciones reales de creación del dominio (reutiliza validaciones existentes). Rate limiting propio: 10 req/min y ~1400/día (cache + properties). Fallback automático entre modelos Gemini si uno agota cuota o deja de existir. **Migración**: portar el patrón (system prompt con schema+opciones de dropdown, respuesta JSON estructurada / function-calling) a la API de Anthropic o Gemini SDK oficial desde un route handler; reemplazar el router de keywords por function-calling real del LLM; rate-limit vía Upstash/Redis o tabla de contadores en Supabase.

---

## 9. MECANISMO TRANSVERSAL: ARCHIVOS ADJUNTOS Y EXPORT XLSX/PDF (usado por ~todos los módulos)

**Patrón actual (GAS)**: cada entidad con adjunto guarda 3 campos planos (`DriveIdArchivo/Evidencia/Foto/Informe/Certificado/Concepto`, `DriveLink...`, `Nombre...` — nombre del campo varía por tabla, mismo concepto). `guardarArchivoDrive(base64, mime, nombre, modulo, token)`: decodifica base64→sube a carpeta de Drive del módulo→comparte `ANYONE_WITH_LINK` salvo módulo=RRHH (confidencial, sin compartir). `eliminarArchivoDrive`: mueve a papelera, tolera "ya no existe" como éxito. `exportarListadoXLSX`: crea Sheet temporal con estilo→exporta vía URL fetch a XLSX→sube a carpeta Drive de reportes→limpia temporales >2h→borra el Sheet intermedio. Export a **PDF** (agregado para Activos): genera Google Doc con secciones/tablas con color, lo exporta a PDF vía URL fetch, mismo housekeeping.

**Migración → Supabase Storage + exceljs/pdf-lib**:
- 1 bucket por módulo (o 1 bucket + prefijo `modulo/`) en Supabase Storage; RRHH = bucket **privado** con signed URLs (expiración corta); resto = público o signed URL larga.
- Guardar en la tabla del dominio: `storage_path`, `file_name` (no un link permanente — generar URL bajo demanda).
- Subida: Server Action/API route recibe `File`/`FormData` directo (sin conversión base64 manual) → `supabase.storage.from(bucket).upload(path, file)`.
- Borrado: `.remove([path])`, idéntica tolerancia a "no encontrado".
- Export XLSX: generar en memoria con `exceljs` (workbook→worksheet→estilo header→filas→`writeBuffer()`) y devolver como descarga HTTP directa (`Content-Disposition: attachment`) — **sin** Sheet/Doc intermedio, sin housekeeping de temporales (elimina esa complejidad por completo).
- Export PDF: usar `pdf-lib`/`@react-pdf/renderer`/Puppeteer(HTML→PDF) en vez de Google Docs — mismo resultado, sin dependencia de Drive.

---

## 10. FRONTEND — PATRONES DE UI A PRESERVAR (conceptualmente, no la implementación GAS)

- **Página con tabs consolidados** para módulos relacionados (patrón usado en Activos: Dashboard/Inventario/Mantenimientos/Calibraciones en 1 sola vista) en vez de 1 página por sub-función — reduce navegación, comparte dropdowns/caché de carga inicial.
- **Modal CRUD estándar**: lista con filtros colapsables + botón "Nuevo" + tabla con acciones (Ver/Editar/Eliminar) + modal de formulario (crear/editar comparten el mismo modal) + modal de "ver detalle" read-only.
- **"Ficha" de entidad con sub-tabs de trazabilidad**: al abrir el detalle de una entidad "padre" (ej. Activo), sub-tabs muestran sus entidades relacionadas filtradas (mantenimientos, calibraciones, documentos) sin salir del modal — patrón reutilizable para cualquier entidad con "hijos" (ej. Paciente→Tratamientos→Consumos, Expediente→Documentos/Exámenes).
- **Campos condicionales por tipo**: mostrar/ocultar secciones enteras de un formulario según el valor de un campo select (ej. campos regulatorios solo si Tipo de Activo = Equipo Médico) — mapeado por lista de valores permitidos, evaluado en el cliente.
- **RBAC en UI**: atributo `data-permiso="CREATE|EDIT|DELETE|EXPORT"` en botones, ocultos/deshabilitados según los permisos del usuario cargados una vez al iniciar sesión (evita requests repetidos) — equivalente a un hook `usePermission(modulo, accion)` en React que lea de contexto/JWT claims.
- **Paginación client-side** sobre datasets ya cargados completos (viable en Sheets por límite práctico de filas; en Postgres preferir paginación server-side real con `LIMIT/OFFSET` o cursor).
- **Componente de búsqueda tipo autocomplete** (TypeSearch) para selects con muchas opciones (proveedores, insumos, pacientes) — normaliza texto igual que la búsqueda de backend.
- **Adjunto de archivo con 2 modos**: subir nuevo vs. pegar link de Drive existente — al migrar a Supabase Storage, el segundo modo pierde sentido salvo que se quiera soportar "vincular URL externa" como feature aparte.

---

## 11. INCONSISTENCIAS/BUGS CONOCIDOS EN EL SISTEMA ACTUAL (no replicar, corregir en el rediseño)

1. **Passwords en texto plano**, sin hash — crítico, resolver con Supabase Auth.
2. Reglas de bloqueo por intentos fallidos definidas en el modelo de datos pero **no implementadas**.
3. Dos implementaciones divergentes de manejo de sesión (una con single-session-enforcement, otra sin) — decidir comportamiento único.
4. Función `registrarAccesoModulo` duplicada en 2 archivos con lógica distinta (ambigüedad de cuál se ejecuta según orden de carga — artefacto de GAS/scope global compartido).
5. Comparaciones de booleanos como string (`'TRUE'|'true'|1|'1'|true`) en decenas de lugares — artefacto de Sheets sin tipos fuertes; usar `boolean` real en Postgres elimina esta clase de bugs.
6. IDs mágicos hardcodeados para estados/tipos (ej. estado "Vigente"=1, "Cumplido"=3, tipo examen 1/2/5, tipo movimiento inventario=4) — frágiles ante reordenamiento de catálogos; usar enums o slugs estables.
7. Ventanas de "próximo a vencer" inconsistentes entre módulos (30 días vs 90 días en Habilitación) — decidir si unificar.
8. Múltiples reimplementaciones locales casi idénticas de helpers de fecha/mapeo de referencia (al menos 4-5 variantes de "formatear fecha DD/MM/YYYY" y "tabla ref→dropdown" dispersas) — consolidar en librería única (`lib/dates.ts`, `lib/refData.ts`).
9. Lógica de descuento de stock de lote **duplicada en 3 servicios** (Gastos, ConsumoInsumos, Inventario) en vez de centralizada — unificar en una función/RPC única.
10. Contratos de retorno inconsistentes entre servicios: mayoría usa `{success, message}`, algunos (`HabilitacionService`, `CalendarioRegulatorioService`) usan `{ok, error}` — estandarizar un único contrato de API.
11. Operaciones multi-tabla sin transacciones reales (crear registro + actualizar stock + crear movimiento = 3 llamadas independientes, sin rollback si falla la 2ª o 3ª) — usar transacciones Postgres.
12. Reporte financiero de Reportes.js quedó desalineado tras un rename de tabla (Compras→Gastos) — no replicar, usar el esquema actual documentado en §2.2.
13. `ReporteInvimaBiomodelantes.js` es un archivo vacío (la lógica vive en `ReportesService.js`) — no crear archivo equivalente vacío en el rediseño.

---

## 12. CHEATSHEET DE MIGRACIÓN (concepto GAS → equivalente Next.js/Supabase)

| GAS/Sheets | Next.js/Vercel/Supabase |
|---|---|
| Google Sheet como tabla | Tabla Postgres con tipos reales, constraints, índices |
| `CRUDService.getAllRecords` (full-scan+cache) | Query SQL directa (`select`, `where`, `join`) |
| ID = última_fila+1 | `serial`/`identity`/`uuid` |
| `ScriptCache` + chunking 100KB | Redis/Vercel KV (sin límite práctico) o directamente Postgres (rápido) |
| Token en ScriptCache, sliding TTL | Supabase Auth (JWT en cookie httpOnly) |
| `RolModuloPermiso` + check manual | Igual + RLS policies + función `has_permission()` |
| Polling 15s + `cache_version` | Supabase Realtime (`postgres_changes`) |
| `LockService` (no usado hoy, debería) | Transacciones Postgres / `SELECT ... FOR UPDATE` |
| Google Drive (adjuntos) | Supabase Storage (buckets por módulo, RLS + signed URLs para privados) |
| Export XLSX vía Sheet temporal + URL fetch | `exceljs` en memoria, descarga directa |
| Export PDF vía Google Docs temporal | `pdf-lib`/`@react-pdf/renderer`/Puppeteer |
| `CalendarApp` (Calendar del script) | Google Calendar API v3 desde API route |
| `ScriptApp` time-based trigger (cron) | `pg_cron` (Supabase) o Vercel Cron |
| Purga probabilística (2% de escrituras) | `pg_cron` job diario determinístico |
| `doGet(?page=X)` switch central | Next.js App Router, 1 ruta por módulo + middleware de auth/RBAC |
| Inyección de token vía `<script>` prepended (workaround iframe) | Cookies httpOnly nativas — innecesario |
| Validación booleana string (`'TRUE'/'true'/1`) | Columna `boolean` nativa |
| Google Gemini vía `UrlFetchApp` | SDK oficial (Anthropic o Gemini) desde route handler; function-calling real en vez de router de keywords |
