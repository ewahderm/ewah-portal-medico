# Requerimientos: Flujo de caja, contabilidad automatizada (PUC) y activos fijos

Fecha: 2026-10-07 (decisiones del usuario incorporadas el mismo día, §15). Estado:
**planeación, sin desarrollo**.

> **Alcance acordado:** este documento es la **visión final** (contabilidad de la clínica
> bajo NIIF). La **primera parte a construir es solo el flujo de caja**, especificada en
> `etapa1-flujo-de-caja.md`, diseñada para que todo lo de aquí se monte encima sin rehacerla.
> Orden: Etapa 1 flujo de caja → 2 por cobrar/pagar y DIAN → 3 contabilidad NIIF → 4 activos
> y mantenimiento → 5 Supersalud. Este documento es la base para
construir el módulo por fases (como Habilitación y SG-SST). Nada de lo aquí descrito existe
todavía en el código; las tablas y funciones son la especificación que se convertirá en
migraciones a partir de la **0089** (la 0081 es un hueco: no se reutiliza).

Cómo se hizo:
- Mapa del código actual (qué se reutiliza y qué no se duplica): §2.
- Investigación normativa (PUC, Supersalud, NIIF, DIAN, depreciación, Res. 3100, Bold).
  La red del entorno bloqueó los portales oficiales: **ninguna norma se leyó en su fuente**.
  Cada dato lleva su nivel de confianza (§1) y lo que debe confirmar el contador está en §14.

---

## 0. Objetivo y alcance

Que una clínica, un consultorio o un profesional independiente lleve su dinero en EWAH sin
saber contabilidad, y que su contador encuentre detrás la contabilidad por partida doble ya
hecha:

1. **Vista administrativa**: "entró / salió plata", con categorías en lenguaje natural.
2. **Vista contable**: el mismo movimiento como asiento (débitos = créditos) en el PUC.
3. Cuentas de dinero (banco, Nequi, Daviplata, efectivo COP/USD/EUR, tarjeta del socio),
   divisas con tasa, deuda con socios.
4. Cuentas por cobrar (pacientes a cuotas) y por pagar (proveedores, socios), con abonos.
5. Pasarela Bold: ingreso bruto pendiente → liquidación neta al día hábil siguiente con la
   comisión como gasto.
6. Importar facturas electrónicas de compra (XML/Excel DIAN) → gasto o cuenta por pagar.
7. Activos fijos: hoja de vida, depreciación, valor en libros, mantenimiento y calibración
   con evidencias (alineado con Habilitación y SG-SST).
8. Cierre mensual: Estado de Resultados y Balance General al corte; reportes para la
   Supersalud (FT001…).

Fuera de alcance (por ahora): emitir facturas electrónicas de venta, liquidar impuestos
(declaraciones), conciliación bancaria automática con extractos, nómina (ya existe en RRHH:
se integra, no se rehace), activos intangibles y arrendamientos NIIF 16.

---

## 1. Estado de verificación de la normativa

Niveles: **[SEC]** varias fuentes secundarias coinciden · **[SEC-1]** una sola fuente ·
**[CONOC]** conocimiento general sin confirmar en esta investigación.

| Tema | Dato | Nivel | Impacto en el diseño |
|---|---|---|---|
| PUC (Dec. 2650/1993) | Clase 1, grupo 2, cuenta 4 y subcuenta 6 dígitos; el registro se hace a subcuenta (Dec. 2894/1994) | [SEC] | Se guarda a 6 dígitos cuando exista subcuenta y se **reporta a 4** como pidió el usuario |
| Uso del PUC bajo NIIF | Cada entidad define su catálogo; el PUC sirve de base (CTCP 2024-0061, 290/2024) | [SEC] | El catálogo es configurable; el PUC es el semilla |
| Supersalud | Las IPS vigiladas reportan **FT001** (catálogo de información financiera), **FT002**, **FT003** (CxC), **FT004** (CxP)… trimestral, **XML**, firma digital, plataforma **nRVCC** (no SISPRO/PISIS) | [SEC] | El "export SISPRO" del pedido es en realidad Supersalud/nRVCC; mapeo PUC → concepto CIF configurable |
| ¿Quién reporta FT001? | No se confirmó si aplica a toda IPS del REPS; profesionales independientes probablemente no | [CONOC] | Se activa según `hab_perfil_prestador` + confirmación del contador |
| Grupo NIIF | Grupo 3 (≤10 trabajadores, activos < 500 SMMLV, ingresos < 6.000 SMMLV) o Grupo 2 (Pymes) | [SEC] | Afecta revelaciones, no la mecánica de partida doble |
| Depreciación fiscal (art. 137 ET) | Edificaciones 2,22 % (45 años); maquinaria y muebles 10 %; **equipo médico-científico 12,5 % (8 años)**; cómputo 20 % (5 años); vehículos 10 % | [SEC] | Vidas útiles por defecto por clase; editables |
| Activos ≤ 50 UVT | Depreciables en el mismo año (DUR 1625 art. 1.2.1.18.5; doctrina DIAN contradictoria). UVT 2026 = $52.374 → $2.618.700 | [SEC] | Opción por clínica, apagada por defecto |
| IVA | Servicios de salud excluidos (art. 476 ET); **estética no reparadora sí causa IVA** (Ley 1943/2018) | [SEC] | Configuración por clínica: responsable de IVA o no; si no, el IVA de compras es mayor valor del gasto |
| Retención en la fuente | Dec. 572/2025 vigente de nuevo desde el 1-jul-2026 (compras 10 UVT 2,5 %; honorarios 10–11 %; arriendo inmuebles 3,5 %…) | [SEC] | F1 no liquida retenciones; las registra si vienen en la factura o si el usuario las digita |
| Tarjeta del socio | Débito gasto / crédito **2355 Deudas con accionistas o socios**; reembolso D 2355 / C banco | [SEC] | Regla automática del pedido, confirmada |
| Divisas | Reconocimiento a la tasa del día (NIIF Pymes 30.7); fiscal: TRM (art. 288 ET); EUR sin TRM oficial | [SEC] | Tasa digitada como pidió el usuario + TRM sugerida + justificación si difiere |
| Bold | ~2,69 % + $300 (+ IVA 19 % sobre comisión); ReteFuente 1,5 % y ReteIVA a ventas con tarjeta; abono al día hábil siguiente | [SEC-1] | La "diferencia" no es solo comisión: se separa comisión, IVA de comisión y retenciones (anticipo de impuestos 1355) |
| Factura electrónica | XML `AttachedDocument` (UBL 2.1) con la factura en CDATA; anexo técnico 1.9 (Res. 165/2023) | [SEC] estructura / [CONOC] XPaths | Parser en dos pasos, tolerante; Excel DIAN por encabezados, no por posición |
| Mantenimiento biomédico | Res. 3100/2019 **vigente** (la 1732/2026 fue revocada); Dec. 4725/2005 art. 38; calibración por laboratorio ONAC ISO 17025; tecnovigilancia Res. 4816/2008 | [SEC] | Plan por equipo según fabricante; hoja de vida; evidencias; alerta |

---

## 2. Lo que ya existe y se reutiliza (no se duplica)

| Existente | Dónde | Uso en este módulo |
|---|---|---|
| `tratamientos.costo`, `medio_pago_id`, `cufe`, `anulado` (append-only, correcciones con `corrige_a`) | 0008, 0045 | **Única fuente de ingresos por servicios hoy.** Cada tratamiento no anulado genera el ingreso (contado o CxC); anular el tratamiento genera el reverso. No se pide digitar dos veces |
| `medios_pago` (por clínica, sin semilla para clínicas nuevas) | 0013 | Se amplía: a qué **cuenta de dinero** llega cada medio, si es crédito (CxC) o pasarela (Bold) |
| `proveedores` (NIT sin DV, tipo de persona) | 0031, 0052 | Tercero de las compras; se amplía con DV, correo, responsabilidad de IVA. La importación DIAN lo crea o lo empareja por NIT |
| `pacientes` | — | Tercero de CxC |
| Nómina, honorarios, prestaciones aprobados (inmutables) | 0048–0059 | Al aprobarse proponen el egreso/causación (categoría Nómina/Planilla); no se rehace la nómina |
| `lotes.costo_unitario`, `movimientos_insumos` | 0015–0038 | La compra de insumos puede crear el lote (como el legado `InsumoCompra`); el consumo alimenta el costo del servicio en una fase posterior |
| `extintores`, `neveras` (Medio Ambiente) | 0035, 0036 | No se migran: un activo puede **enlazar** una nevera; los extintores siguen en Medio Ambiente |
| `hab_evidencias` + proveedoras `fn_hab_ev_*`; criterio 11.1.DO.2.1 y documento `HAB_MANTENIMIENTO_EQUIPOS` | 0067, 0086 | Nueva proveedora `activos_mantenimiento`: el cronograma y su cumplimiento como evidencia de Dotación |
| SG-SST: estándar 4.2.5 (mantenimiento), documento `SST_MANTENIMIENTO`, `sst_acciones.origen 'inspeccion'` | 0074, 0078 | El cumplimiento del plan de mantenimiento informa el estándar; hallazgos → acciones |
| `hab_obligaciones_catalogo` ya trae FT001, FT002, FT003, FT004… con fechas | 0064, 0069 | El export de Supersalud se **cuelga de esas obligaciones** (no otro calendario) |
| `hab_suficiencia_patrimonial` (se digita a mano) | 0068 | Se prellena desde el Balance del corte |
| `hab_perfil_prestador.grupo_supersalud`, `tiene_revisor_fiscal` | 0061 | Decide si aplica FT001 y quién firma |
| Patrones: registro de módulo (0072), `has_permission`, `has_entitlement`, `fn_auditoria`, `fn_hab_forzar_autor`, `fn_hab_inmutable`, subida firmada (`verificarArchivoSubido`, `firmar`), cron diario, Resend, XLSX (`lib/exportar/xlsx.ts`), PDF (`pdf-lib`), festivos (`fn_hab_sumar_dias_habiles`) | varios | Se siguen tal cual |
| Reportes/analítica (`fn_reportes_analitica_clinica`) | 0084, 0088 | Suma ingresos de tratamientos; luego se le agregan gastos y margen |
| Spec del legado: `Gastos`, `CuentaPorPagar/Cobrar`, `ActivoFijo`, `MantenimientoActivo`, `CalibracionEquipo`; lección §8.8 (tabla real de abonos, no texto) | docs/spec-ewah-app.md | Se adopta la lección: abonos como filas |

Hallazgos que condicionan el diseño:
- No hay concepto de moneda ni TRM en la plataforma (todo COP); `formatoMoneda` asume COP.
- `verificarArchivoSubido` no acepta xml/csv/zip: hay que ampliarlo con validación propia
  (XML bien formado, tamaño) — no basta con "magic bytes".
- `clinicas` no guarda régimen tributario, responsabilidad de IVA ni si es agente retenedor.

---

## 3. Decisiones de diseño (propuestas por defecto; se pueden cambiar)

1. **Un solo libro**: la vista administrativa escribe *movimientos*; la base de datos genera
   el *asiento* (partida doble) en la misma transacción. El usuario nunca escribe débitos y
   créditos; el contador puede hacer **asientos manuales** (ajustes) y reclasificar.
2. **Inmutabilidad**: nada contable se borra ni se edita. Corregir = anular (asiento de
   reverso con motivo) y registrar de nuevo, igual que tratamientos y nómina. Un mes
   **cerrado** no acepta movimientos con fecha en ese mes.
3. **PUC a 4 dígitos para reportar, 6 opcional para registrar**: catálogo global semilla
   (PUC 2650) + subcuentas propias por clínica. Los estados financieros agregan a 4.
4. **Categoría ≠ cuenta**: cada categoría comercial apunta a una cuenta PUC por defecto
   (global) que el contador puede **remapear por clínica** sin tocar los movimientos ya
   registrados (los nuevos usan el mapeo nuevo; reclasificar lo viejo es un asiento).
5. **Medio de pago ≠ cuenta de dinero**: PSE, tarjeta débito o transferencia son medios que
   llegan a una cuenta (normalmente el banco). La lista del pedido mezcla ambos; se modela
   así: *cuentas* = Banco(s), Nequi, Daviplata, Efectivo COP, Efectivo USD, Efectivo EUR,
   Bold (por liquidar) y **Tarjeta de crédito del socio** (que no es dinero de la clínica
   sino un pasivo con el socio); *medios* = los de `medios_pago`, cada uno con su cuenta destino.
6. **Ingresos desde tratamientos, no digitados**: el valor ya se registra en el tratamiento.
   El módulo lo contabiliza automáticamente desde la fecha de activación; lo anterior entra
   por un **asiento de saldos iniciales**, no se recontabiliza la historia.
7. **Multi-sede**: todo movimiento lleva `sede_id` opcional ("General"). Los estados
   financieros son de la clínica (entidad legal); por sede se ve el estado de resultados de
   gestión.
8. **Plan**: módulo visible en todos los planes. **Gratis**: registrar ingresos y egresos por
   categoría y ver el flujo de caja. **Pro** (`gestion`): CxC/CxP, Bold, DIAN, activos,
   vista contable, cierre y estados financieros, exportes, alertas.
9. **Roles**: dos módulos RBAC para separar quién ve qué:
   `finanzas` (vista administrativa, flujo de caja) y `contabilidad` (asientos, cierre,
   estados, export). Rol sugerido nuevo "Contador" (solo `contabilidad` + VIEW de `finanzas`).
   Permisos: VIEW, CREATE, EDIT, VOID, APPROVE (cerrar mes), EXPORT, IMPORT (DIAN).

---

## 4. Modelo de datos (especificación para el DDL)

Convenciones de todas las tablas por clínica: `id uuid pk`, `clinica_id` (FK, RLS
`clinica_id = clinica_actual()` + permiso del módulo), `created_by/updated_by` forzados por
`fn_hab_forzar_autor`, `created_at/updated_at`, `fn_auditoria`. Importes `numeric(16,2)`;
tasas `numeric(18,6)`. Sin políticas de delete. Las vistas son `security_invoker`.

### 4.1 Catálogo contable
- **`cont_puc`** (global, solo lectura para usuarios): `codigo text pk` (1, 2, 4 o 6 dígitos,
  `^[1-9][0-9]*$`), `nombre`, `nivel` (clase/grupo/cuenta/subcuenta), `naturaleza`
  (`debito`/`credito`), `padre`, `activo`, `fuente` ('PUC 2650'), `verificado bool`.
  Semilla: clases 1–7 y las cuentas de §5 con sus grupos.
- **`cont_cuentas_clinica`**: subcuentas propias (6+ dígitos) colgadas de una cuenta de 4 del
  PUC, y alias por clínica. `unique (clinica_id, codigo)`; el padre debe existir en `cont_puc`.
- **`cont_mapeo_cif`** (fase 9): `clinica_id`, `puc_codigo` → `concepto_cif` (Supersalud).

### 4.2 Categorías comerciales (vista administrativa)
- **`fin_categorias`** (global): `codigo` (p. ej. `ARRENDAMIENTO`), `nombre` visible,
  `tipo` (`egreso`/`ingreso`), `puc_codigo_defecto` (FK `cont_puc`), `comportamiento`
  (`gasto`, `activo_fijo`, `inventario`, `impuesto`, `pago_tercero`), `ayuda` (texto
  simple), `orden`, `icono`.
- **`fin_categorias_clinica`**: `clinica_id`, `categoria_codigo`, `puc_codigo` (remapeo del
  contador), `activa`, `nombre_propio` (opcional). También permite categorías propias de la
  clínica con su cuenta.

### 4.3 Terceros, socios y cuentas de dinero
- **`proveedores`** (existente) + columnas: `dv`, `email`, `responsable_iva bool`,
  `regimen` (opcional).
- **`fin_socios`**: `clinica_id`, `tipo_identificacion_id`, `numero_identificacion`,
  `nombre`, `porcentaje_participacion` (opcional), `activo`.
- **`fin_cuentas`** (cuentas de dinero): `clinica_id`, `nombre`, `tipo` (`banco`, `nequi`,
  `daviplata`, `efectivo`, `pasarela`, `tarjeta_socio`), `moneda` (`COP`/`USD`/`EUR`),
  `puc_codigo` (1105 caja, 1110 bancos, 1120 ahorros, 1345/1380 pasarela por liquidar,
  2355 tarjeta del socio), `socio_id` (obligatorio si `tarjeta_socio`), `banco_id`
  (catálogo `bancos` de RRHH), `ultimos_digitos`, `sede_id` (opcional, cajas por sede),
  `activa`. Semilla al activar el módulo: Efectivo COP y Banco principal.
- **`medios_pago`** (existente) + columnas: `fin_cuenta_id` (a qué cuenta llega),
  `es_credito bool` (genera CxC), `es_pasarela bool` + `pasarela` (`bold`, u otra),
  `aplica_a` (`ingresos`, `egresos`, `ambos`).
- **`fin_tarifas_medio_pago`** (decisión del usuario: lo que cobra Bold u otro medio se
  **personaliza por medio de pago**, para cobros y para compras): `clinica_id`,
  `medio_pago_id`, `vigente_desde` (histórico: una tarifa nueva no cambia lo ya liquidado),
  `porcentaje_comision`, `valor_fijo_comision`, `porcentaje_iva_comision` (19 % por
  defecto), `porcentaje_retefuente`, `porcentaje_reteiva` (sobre el IVA de la venta),
  `porcentaje_reteica`, `recargo_internacional`, `dias_habiles_abono` (1 para Bold),
  `observacion`. Con ella la BD calcula el **neto esperado** de cada cobro y la liquidación
  compara contra lo que realmente llegó.

### 4.4 Movimientos (vista administrativa)
- **`fin_movimientos`**: `clinica_id`, `sede_id`, `fecha date`, `tipo` (`ingreso`, `egreso`,
  `transferencia`), `categoria_codigo`, `descripcion`, `tercero_tipo` (`proveedor`,
  `paciente`, `socio`, `empleado`, `otro`) + `tercero_id`/`tercero_nombre`,
  `cuenta_id` (origen/destino del dinero), `cuenta_destino_id` (solo transferencias),
  `moneda`, `monto_original`, `tasa_cop` (1 para COP), `valor_cop` (generado:
  `round(monto_original * tasa_cop, 2)`), `tasa_justificacion`, `iva`, `retenciones jsonb`,
  `estado` (`registrado`, `pendiente_liquidacion`, `anulado`), `origen` (`manual`,
  `tratamiento`, `factura_dian`, `nomina`, `bold`, `cxc_abono`, `cxp_abono`, `activo`),
  `origen_id`, `documento_id` (CxC/CxP), `asiento_id`, `soporte_storage_path`,
  `anulado_motivo`, `anula_a`.
  Reglas: `valor_cop > 0`; moneda ≠ COP exige tasa > 0; no se edita (solo anular);
  la fecha debe caer en un periodo abierto.

### 4.5 Cuentas por cobrar y por pagar
- **`fin_documentos`**: `clinica_id`, `sede_id`, `tipo` (`cxc`, `cxp`), `tercero_tipo`,
  `tercero_id`, `concepto`, `fecha`, `vencimiento`, `valor_total`, `saldo` (mantenido por
  trigger), `numero_cuotas`, `estado` (`abierta`, `pagada`, `anulada`), `origen`
  (`tratamiento`, `factura_dian`, `tarjeta_socio`, `manual`), `origen_id`.
- **`fin_documento_cuotas`** (plan de cuotas de CxC): `documento_id`, `numero`, `fecha`,
  `valor`.
- **`fin_abonos`**: `documento_id`, `fecha`, `valor_cop`, `cuenta_id`, `movimiento_id`.
  Un abono crea su movimiento y su asiento; el saldo nunca queda negativo.

### 4.6 Asientos (vista contable)
- **`cont_periodos`**: `clinica_id`, `anio`, `mes`, `estado` (`abierto`, `cerrado`),
  `cerrado_por`, `cerrado_en`, `reabierto_motivo`. Unique `(clinica_id, anio, mes)`.
- **`cont_asientos`**: `clinica_id`, `fecha`, `periodo` (anio, mes), `numero` (consecutivo
  por clínica y año, asignado por la BD con candado), `tipo` (`automatico`, `manual`,
  `reverso`, `cierre`, `saldos_iniciales`, `depreciacion`), `descripcion`,
  `movimiento_id`, `reversa_a`, `sede_id`.
- **`cont_asiento_lineas`**: `asiento_id`, `clinica_id`, `puc_codigo` (cuenta o subcuenta),
  `debito`, `credito` (uno de los dos > 0), `tercero_tipo/tercero_id`, `sede_id`,
  `moneda`, `monto_original`, `descripcion`.
  **Invariante**: Σ débitos = Σ créditos por asiento, verificado con trigger diferido
  (`constraint trigger ... deferrable initially deferred`). Inmutables (`fn_hab_inmutable`).
- **`v_cont_libro_mayor`** (vista invoker): saldos por cuenta y periodo, agregables a 4 dígitos.

### 4.7 Pasarela Bold
- **`fin_liquidaciones_pasarela`**: `clinica_id`, `pasarela` ('bold'), `fecha_liquidacion`,
  `cuenta_banco_id`, `bruto`, `comision`, `iva_comision`, `retefuente`, `reteiva`,
  `reteica`, `neto`, `diferencia_sin_detalle`, `soporte_storage_path` (reporte de Bold),
  `movimientos_ids uuid[]` (cobros que liquida). Regla:
  `bruto = neto + comision + iva_comision + retefuente + reteiva + reteica + diferencia_sin_detalle`.

### 4.8 Facturas de compra DIAN
- **`fin_facturas_compra`**: `clinica_id`, `cufe` (unique por clínica: no se importa dos
  veces), `numero`, `prefijo`, `fecha_emision`, `proveedor_id`, `proveedor_nit`,
  `proveedor_dv`, `proveedor_nombre`, `base`, `iva`, `inc`, `retenciones jsonb`, `total`,
  `lineas jsonb` (descripción, cantidad, valor), `fuente` (`xml`, `excel_dian`),
  `archivo_storage_path`, `estado` (`por_clasificar`, `causada`, `pagada`, `descartada`),
  `categoria_codigo`, `documento_id` (CxP) o `movimiento_id` (gasto pagado),
  `descartada_motivo`.
- **`fin_importaciones`**: lote de carga (archivo, totales leídos/creados/duplicados/errores,
  detalle de errores por fila).

### 4.9 Activos fijos y mantenimiento
- **`act_activos`**: `clinica_id`, `sede_id`, `consultorio_id`, `codigo_interno`, `nombre`,
  `clase` (`infraestructura`, `equipo_biomedico`, `muebles_enseres`, `equipo_computo`;
  ampliable a `vehiculo`), `puc_codigo` (1516/1532/1524/1528…), `marca`, `modelo`, `serie`,
  `registro_invima`, `clasificacion_riesgo` (I, IIa, IIb, III — biomédicos), `proveedor_id`,
  `factura_id`, `movimiento_id`, `fecha_adquisicion`, `valor_adquisicion`, `valor_residual`,
  `vida_util_meses` (por defecto según clase, §6), `metodo` ('linea_recta'),
  `fecha_inicio_depreciacion`, `depreciacion_inmediata bool` (≤ 50 UVT, si la clínica lo
  activa), `estado` (`activo`, `en_mantenimiento`, `dado_de_baja`), `baja_fecha`,
  `baja_motivo`, `nevera_id` (enlace opcional a Medio Ambiente), `ficha_tecnica_path`.
  El valor en libros y la depreciación acumulada **no se guardan**: se calculan (vista) a
  partir de las depreciaciones registradas.
- **`act_depreciaciones`**: `activo_id`, `anio`, `mes`, `valor`, `asiento_id`
  (unique activo+mes). Las genera el cierre mensual.
- **`act_planes_mantenimiento`**: `activo_id`, `tipo` (`preventivo`, `calibracion`,
  `verificacion_metrologica`, `inspeccion`), `frecuencia_meses`, `fuente_frecuencia`
  (`fabricante`, `protocolo_propio`), `responsable` (proveedor/empresa), `requiere_onac bool`
  (calibración), `proxima_fecha` (calculada), `activo`.
- **`act_mantenimientos`** (ejecuciones, inmutables salvo anular): `activo_id`, `plan_id`
  (null = correctivo), `tipo` (incluye `correctivo`), `fecha`, `ejecutado_por`,
  `laboratorio_onac` + `certificado_numero` (calibración), `resultado` (`conforme`,
  `no_conforme`, `fuera_de_servicio`), `observaciones`, `costo` + `movimiento_id` (el gasto
  sale en el flujo de caja, categoría Habilitación & SGSST o mantenimiento),
  `evidencias` (archivos en storage `finanzas/activos/<activo>/…`).

### 4.10 Configuración tributaria y contable
Decisión del usuario: **el régimen tributario se configura en "Datos básicos de la clínica"**
(diálogo existente de Parámetros, `datos-basicos-clinica-dialog.tsx`), no en una pantalla
aparte del módulo.
- **`clinicas`** (existente) + columnas editables en Datos básicos: `regimen_tributario`
  (`ordinario`, `simple`, `persona_natural_no_responsable`, `especial`),
  `responsable_iva bool`, `agente_retenedor bool`, `autorretenedor bool`,
  `gran_contribuyente bool`, `dv` (dígito de verificación del NIT), `grupo_niif` (2/3).
- **`cont_config`** (solo lo contable, en `/contabilidad`): `clinica_id` pk,
  `fecha_activacion`, `depreciacion_inmediata_50uvt bool`, `moneda_funcional` ('COP'),
  `cuenta_ingreso_servicios` (4165 por defecto), `cuenta_ingreso_gravado` (estética con IVA).
- **Reporte a la Supersalud: se determina según la norma, no con una casilla.** Una
  función `fn_cont_reportes_supersalud_aplicables()` decide qué formatos (FT001, FT002,
  FT003, FT004…) le aplican a la clínica a partir de lo que ya existe en Habilitación
  (`hab_perfil_prestador.naturaleza`, `grupo_supersalud`, tipo de prestador; los
  profesionales independientes quedan fuera mientras la norma no diga lo contrario) y las
  obligaciones FT00x ya sembradas en `hab_obligaciones_catalogo`. La tabla de reglas queda
  versionada y marcada "por cotejar" hasta leer la circular vigente.

---

## 5. Mapeo de categorías a PUC (semilla; el contador lo confirma)

Débito del egreso → cuenta de la categoría; crédito → cuenta de dinero (o 2355 si es la
tarjeta del socio, o 2205/2335 si queda por pagar). Confianza [CONOC] salvo nota.

| Categoría (vista simple) | Cuenta 4 dígitos | Subcuenta sugerida | Comportamiento |
|---|---|---|---|
| Compra Insumos | 1455 Materiales, repuestos y accesorios (inventario) o gasto directo 5195 si la clínica no lleva inventario contable | — | inventario (puede crear el lote) |
| Arrendamiento | **5120** Arrendamientos | 512010 construcciones y edificaciones | gasto |
| Nómina | 5105 Gastos de personal (contrapartida 2505/2510–2525) | 510506 sueldos | gasto (desde nómina aprobada) |
| Planilla (seguridad social) | 5105 (aportes patronales) / 2370 (retenido al empleado) | 510568–510578 | pago_tercero |
| Servicios Públicos | 5135 Servicios | 513525 acueducto, 513530 energía, 513535 teléfono/internet | gasto |
| Prepagada | **5105 Gastos de personal** — los socios son empleados a término indefinido, así que es un beneficio laboral (tercero = el empleado-socio) | 510584 o 510595 (por confirmar) | gasto; marca si es pago no constitutivo de salario (art. 128 CST) para no afectar la base de aportes |
| Gasolina | 5195 Diversos | 519535 combustibles y lubricantes | gasto |
| IA & Redes Sociales | 5235 Servicios (ventas) para pauta / 5135 para suscripciones | 523560 publicidad; 513520 procesamiento de datos | gasto |
| Software & Página WEB | 5135 (SaaS, hosting) / 1635 Licencias si > 1 año | 513520 | gasto o intangible |
| Impuestos | 5115 Impuestos (ICA, predial, GMF); renta 5405 | 511505 ICA | impuesto |
| Cámara de Comercio | 5140 Gastos legales | 514010 registro mercantil | gasto |
| Contabilidad | 5110 Honorarios | 511030 | gasto |
| Habilitación & SGSST | 5140 (trámites) / 5110 (asesoría) / 5145 (mantenimiento) | 514015, 511035 | gasto |
| Compra Activos | 15xx según clase (1516, 1524, 1528, 1532) | — | activo_fijo (abre la hoja de vida) |
| Otros Gastos | 5195 Diversos | 519595 | gasto |
| **Préstamo a socio** (sale plata) | **1325** Cuentas por cobrar a socios | 132505 / 132510 | `prestamo_socio`: crea CxC al socio; no es gasto |
| **Préstamo de socio** (entra plata) | **2355** Deudas con accionistas o socios | 235505 | `prestamo_socio`: crea CxP al socio; no es ingreso |

"Cuota Aptos" **se elimina** (decisión del usuario).

Cuentas automáticas: ingresos por servicios **4165** (nombre a confirmar; estética gravada
quizá 4170) · comisiones Bold **5305** (530515) · retenciones que le practican a la clínica
**1355** · IVA de compras: mayor valor del gasto si la clínica no es responsable; 2408 si lo
es · diferencia en cambio 4210 (421020) / 5305 (530525) · depreciación **5160** / **1592** ·
CxC pacientes **1305** · proveedores **2205** · costos y gastos por pagar **2335** ·
socios **2355**.

---

## 6. Reglas de negocio (motor de asientos)

Todas en PostgreSQL, en la misma transacción del movimiento (función `fn_fin_contabilizar`
llamada por trigger after insert en `fin_movimientos`; el cliente nunca manda líneas).

| # | Evento | Asiento |
|---|---|---|
| R1 | Egreso pagado (banco/efectivo/Nequi…) | D cuenta de la categoría (+ IVA si no responsable) / C cuenta de dinero; retenciones practicadas: C 2365 |
| R2 | **Egreso con Tarjeta de Crédito del Socio** | D cuenta de la categoría / C **2355** con tercero = socio; crea `fin_documentos` CxP a nombre del socio |
| R3 | Reembolso al socio | D 2355 / C banco; abono a la CxP del socio |
| R4 | Ingreso de contado (tratamiento con medio de contado) | D cuenta de dinero del medio / C 4165 |
| R5 | Tratamiento a crédito o en cuotas | D 1305 (tercero paciente) / C 4165; crea CxC con su plan de cuotas |
| R6 | Abono de paciente | D cuenta de dinero / C 1305 |
| R7 | Cobro con Bold (pendiente) | D **cuenta pasarela por liquidar** (1345/1380) / C 4165 (o C 1305 si abona una CxC); estado `pendiente_liquidacion`; fecha esperada = `fn_hab_sumar_dias_habiles(fecha, 1)` |
| R8 | **Liquidación Bold** | D banco (neto) + D 5305 comisión + D IVA comisión (5305 o 2408) + D 1355 retenciones + D 5305 `diferencia_sin_detalle` / C cuenta pasarela (bruto). Comisión, IVA y retenciones se **calculan con la tarifa del medio de pago** vigente en la fecha del cobro; el usuario confirma el neto real y, si no coincide con el esperado, la diferencia queda en `diferencia_sin_detalle` (gasto financiero) con aviso |
| R9 | Compra en divisa | Igual que R1 con `valor_cop = monto × tasa`; la línea guarda moneda y monto original |
| R10 | Factura DIAN causada (por pagar) | D categoría (+ IVA según config) / C 2205 o 2335 (tercero proveedor); CxP |
| R11 | Pago de factura causada | D 2205/2335 / C cuenta de dinero; abono a la CxP |
| R12 | Compra de activo | D 15xx / C dinero o CxP; abre `act_activos` |
| R13 | Depreciación mensual (cierre) | D 5160 / C 1592 por activo (línea recta: (valor − residual) / vida útil) |
| R14 | Anulación | Asiento espejo (`tipo = reverso`); el original queda |
| R15 | Tratamiento anulado o corregido | Reverso del ingreso/CxC; la corrección genera el nuevo |
| R16 | Transferencia entre cuentas (p. ej. efectivo a banco) | D cuenta destino / C cuenta origen |
| R17 | Nómina aprobada | Propone la causación (D 5105 / C 2505, 2370…) y el pago; el usuario confirma |
| R18 | **Préstamo a socio** | D 1325 (tercero socio) / C cuenta de dinero; crea CxC al socio con plan de devolución opcional. Aviso: el art. 35 ET presume un interés mínimo sobre préstamos de la sociedad a sus socios — el contador decide si se causa |
| R19 | **Préstamo de socio a la clínica** | D cuenta de dinero / C 2355 (tercero socio); crea CxP al socio |
| R20 | Devolución de un préstamo | Abono a la CxC o CxP correspondiente (como R3/R6) |
| R21 | Egreso pagado con un medio que cobra comisión (p. ej. tarjeta en una compra) | Si el medio tiene tarifa para egresos, además del gasto se registra la comisión (D 5305 / C cuenta) calculada con `fin_tarifas_medio_pago` |

Validaciones: periodo abierto; categoría activa con cuenta PUC válida; tasa obligatoria y
TRM sugerida para USD; si la tasa difiere de la TRM en más de un umbral (p. ej. 3 %), pedir
justificación; no se permite egreso desde una cuenta `tarjeta_socio` sin socio.

---

## 7. Estados financieros y cierre mensual

- **`fn_cont_estado_resultados(anio, mes, sede?)`**: clases 4 − 5 − 6 (− 7) del mes y
  acumulado del año, agregadas a 4 dígitos, con comparativo del mes anterior.
- **`fn_cont_balance_general(anio, mes)`**: saldos acumulados al corte de las clases 1, 2 y 3,
  con el resultado del ejercicio dentro del patrimonio. Verifica Activo = Pasivo + Patrimonio.
- **`fn_cont_cerrar_periodo(anio, mes)`** (APPROVE de `contabilidad`, definer): verifica que no
  queden Bold sin liquidar vencidos ni facturas por clasificar del mes (avisos, no bloqueo
  salvo descuadre), genera las depreciaciones, opcionalmente la reexpresión de saldos en
  divisa, guarda una **foto inmutable** de ambos estados (`cont_estados_cierre`) y bloquea el
  mes. Reabrir exige motivo y queda auditado.
- Exportes: XLSX y PDF de ambos estados, libro diario y mayor (solo `contabilidad` EXPORT).
- Integraciones: prellenar `hab_suficiencia_patrimonial` con el balance del corte; agregar
  gastos y margen a Reportes/analítica.

### Supersalud (lo que el pedido llama "SISPRO")
Los formatos FT001 (catálogo de información financiera), FT002, FT003 (CxC) y FT004 (CxP)
son de la Supersalud, se cargan en **nRVCC** en **XML** trimestralmente con firma digital (no
en SISPRO/PISIS). El diseño deja lista la base:
1. `cont_mapeo_cif`: cada cuenta PUC → concepto del catálogo CIF de la Supersalud.
2. FT003/FT004 salen de `fin_documentos` (CxC/CxP por tercero y edad).
3. El generador de XML se construye **cuando se tenga el instructivo oficial** (FT001 v10 de
   enero de 2026) — hoy no se pudo leer; no se inventa el formato.
4. El export queda asociado a las obligaciones FT00x ya sembradas en Habilitación.

---

## 8. Importación de facturas DIAN

1. Carga de uno o varios **XML** (o ZIP con XML/PDF, como llegan al correo) o del **Excel de
   documentos recibidos** del portal DIAN. Subida firmada al bucket `finanzas`
   (`<clinica>/facturas/<lote>/…`), máximo 10 MB por archivo.
2. Lectura en el servidor (route handler, no server action: límite de 1 MB):
   - XML: `AttachedDocument` → extraer la `Invoice` del CDATA → leer NIT + DV
     (`PartyTaxScheme/CompanyID@schemeID`), razón social, `cbc:ID`, CUFE (`cbc:UUID`),
     fecha, `LegalMonetaryTotal` (base, total), `TaxTotal` (01 IVA, 04 INC),
     `WithholdingTaxTotal` (05, 06, 07) y líneas. Tolerante a facturas sin envoltorio.
   - Excel/CSV: por **nombre de encabezado** (no por posición); solo trae totales (sin
     líneas). Si luego llega el XML con el mismo CUFE, lo completa.
   - Notas crédito: se reconocen y restan.
3. Por cada factura: deduplicar por CUFE; emparejar o crear el proveedor por NIT; estado
   `por_clasificar`. **Sugerir categoría** por el historial del proveedor (la última usada).
4. Bandeja "Facturas por clasificar": el usuario elige categoría y si ya la pagó (cuenta) o
   queda por pagar (vencimiento) → R1 o R10. Compra de activo → abre la hoja de vida;
   compra de insumos → ofrece crear los lotes.
5. Validaciones: factura a nombre del NIT de la clínica (si no, aviso: no deducible);
   fecha en periodo abierto; total = base + impuestos − descuentos.

---

## 9. Activos y mantenimiento

- Hoja de vida por activo (datos de §4.9, documentos, historial de mantenimientos y
  calibraciones, depreciación mes a mes, valor en libros) con PDF descargable.
- Vidas útiles por defecto (art. 137 ET, editables): infraestructura 45 años; equipo
  biomédico 8 años; muebles y enseres 10 años; cómputo 5 años; vehículos 10 años.
- Cronograma: por cada plan, `proxima_fecha = última ejecución + frecuencia` (o fecha de
  adquisición si nunca se hizo). Vista calendario mensual y lista "vencidos / este mes /
  próximos 30 días", filtrable por sede y clase. Los biomédicos sin plan aparecen como
  pendiente ("Res. 3100: define el mantenimiento según el fabricante").
- Registrar ejecución: tipo, fecha, quién, certificado (calibración: laboratorio ONAC y
  número), resultado, costo (genera el egreso) y evidencias (PDF/foto). Resultado
  `fuera_de_servicio` pone el activo en mantenimiento y avisa.
- Alertas diarias (cron existente): mantenimientos y calibraciones a 30/7/0 días y vencidos.
- Integraciones:
  - **Habilitación**: proveedora `fn_hab_ev_activos_mantenimiento` (por sede: biomédicos con
    plan, % al día, vencidos) para el criterio de Dotación (11.1.DO.2.1).
  - **SG-SST**: el % de cumplimiento informa el estándar 4.2.5; un mantenimiento no
    conforme puede abrir una acción (`sst_acciones` origen `inspeccion`).
  - **Tecnovigilancia** (Res. 4816/2008): campo para marcar un evento adverso asociado al
    equipo y recordar el reporte (72 h serios / trimestral no serios). Solo registro y aviso.

---

## 10. Interfaz

### 10.1 Vista administrativa (`/finanzas`)
- **Inicio**: saldo por cuenta (con divisas convertidas), entradas vs salidas del mes, gasto
  por categoría (barras), por cobrar y por pagar (vencido / por vencer), Bold por liquidar,
  facturas por clasificar, deuda con socios. Filtro de sede.
- **Registrar**: dos botones grandes "Entró plata" / "Salió plata". Formulario de 4 pasos en
  una sola pantalla: ¿cuánto? (moneda; si no es COP, tasa con la TRM sugerida) → ¿en qué?
  (tarjetas de categoría con icono y ayuda) → ¿de dónde salió / a dónde llegó? (cuentas; la
  tarjeta del socio explica "le quedará debiendo a <socio>") → ¿ya se pagó o queda pendiente?
  (+ proveedor, soporte opcional). Sin palabras contables.
- **Movimientos**: lista con filtros (fecha, categoría, cuenta, sede), anular con motivo.
- **Por cobrar / Por pagar**: documentos con saldo, cuotas, registrar abono, recordatorio.
- **Socios**: por socio, cuánto le debe la clínica (tarjeta y préstamos del socio) y cuánto
  le debe él a la clínica (préstamos a socio), historial, registrar reembolso, préstamo o
  devolución.
- **Bold**: cobros pendientes por día esperado de abono, con el **neto esperado** según la
  tarifa del medio; "Liquidar" confirma el neto real (y adjunta el reporte de Bold).
- **Parámetros → Medios de pago**: por medio, cuenta destino, si es crédito o pasarela y su
  **tarifa** (comisión %, valor fijo, IVA de la comisión, retenciones, días de abono) con
  vigencia; un simulador muestra "de $100.000 te llegan $X".
- **Facturas DIAN**: importar (arrastrar XML/ZIP/Excel), resultado de la carga, bandeja por
  clasificar.
- **Activos**: inventario por clase/sede con valor en libros, hoja de vida, cronograma de
  mantenimiento (calendario), registrar mantenimiento.

### 10.2 Vista contable (`/contabilidad`)
- Libro diario (asientos con sus líneas, origen enlazado), mayor por cuenta, balance de
  prueba, auxiliar por tercero.
- Asiento manual (con validación de cuadre en vivo) y reclasificación.
- Catálogo: PUC + subcuentas propias; mapeo de categorías → cuentas; configuración
  contable (§4.10).
- Cierre mensual: lista de verificación, cerrar/reabrir, estados financieros del mes
  (Estado de Resultados y Balance), comparativos, exportes XLSX/PDF, mapeo CIF y estado de
  los reportes FT00x.

### 10.3 Componentes React previstos
`RegistrarMovimientoDialog` (pasos), `SelectorCategoria` (tarjetas), `SelectorCuenta`,
`CampoMonedaTasa` (TRM sugerida + justificación), `ImportadorFacturasDian`
(carga múltiple con subida firmada + tabla de resultados), `BandejaFacturas`,
`LiquidarBoldDialog`, `TarifaMedioPagoDialog`, `PrestamoSocioDialog`, `AbonoDialog`, `TableroFinanzas` (KPIs + gráficos según la guía de
visualización), `LibroDiario`, `AsientoManualForm`, `EstadoResultados`, `BalanceGeneral`,
`CierreMensual`, `HojaVidaActivo`, `CronogramaMantenimiento`, `RegistrarMantenimientoDialog`.
Mismos patrones de la app: Base UI (Combobox, Dialog, Tabs), toasts, estado congelado tras
`router.refresh()`, fechas en hora de Colombia, móvil 390 px sin scroll horizontal.

### 10.4 Funciones y acciones de servidor previstas
- PostgreSQL: `fn_fin_contabilizar` (trigger), `fn_fin_anular_movimiento`,
  `fn_fin_registrar_abono`, `fn_fin_liquidar_pasarela`, `fn_fin_reembolsar_socio`,
  `fn_cont_asiento_manual`, `fn_cont_cerrar_periodo` / `fn_cont_reabrir_periodo`,
  `fn_cont_estado_resultados`, `fn_cont_balance_general`, `fn_act_depreciar_mes`,
  `fn_act_proximos_mantenimientos`, `fn_fin_alertas_pendientes` (cron), definer solo donde
  haga falta (lista cerrada, como en SG-SST).
- Server actions (`lib/finanzas/*`, `lib/contabilidad/*`, `lib/activos/*`): registrar/anular
  movimiento, abono, liquidar Bold, clasificar factura, crear activo, plan y ejecución de
  mantenimiento, cerrar mes. Route handlers para importar DIAN y exportar.
- Lógica pura con pruebas (vitest): parser DIAN, cálculo de depreciación, conversión de
  divisas y redondeo, cuadre de asientos, agrupación a 4 dígitos, sugerencia de categoría.

---

## 11. Seguridad, integridad y alertas

- RLS en todas las tablas; sin inserts directos en `cont_asientos`/`cont_asiento_lineas`
  (solo por funciones); lista cerrada de RPC definer; funciones de trigger sin EXECUTE.
- Inmutabilidad: movimientos, asientos, abonos, liquidaciones, depreciaciones y
  ejecuciones de mantenimiento no se editan; se anulan con motivo.
- Autoría forzada; auditoría; montos siempre recalculados en la BD (el cliente no manda
  `valor_cop` ni líneas).
- Bucket privado `finanzas` (10 MB; pdf, jpg, png, webp, xml, zip, xlsx, csv) con
  validación propia para XML/CSV.
- Datos sensibles: salarios ya están separados en `nomina`; la vista contable mostrará el
  total de nómina, no el detalle por persona, salvo permiso de `nomina`.
- Alertas (cron diario, una vez por plazo): CxP por vencer y vencidas; CxC vencidas; Bold sin
  liquidar después de 2 días hábiles; facturas por clasificar con más de 5 días; mes sin
  cerrar a los 10 días del mes siguiente; mantenimientos/calibraciones; reportes FT00x.

---

## 12. Fases propuestas

> Reordenadas por etapas (decisión del usuario): la Etapa 1 (flujo de caja) toma de aquí
> cuentas, socios, movimientos, Bold, tarifas y cierre de mes **sin asientos**; las fases de
> esta tabla son las de la visión completa y se reparten en las etapas 2 a 5.

Cada fase con migración, pruebas de BD (`bd-local`), vitest y recorrido en navegador, como
Habilitación y SG-SST. Números de migración a confirmar al construir (coordinar con otras
sesiones: hoy la siguiente libre es 0089).

| Fase | Contenido | Depende de |
|---|---|---|
| **F0 · Decisiones** | Respuestas del contador (§14); fijar mapeo de categorías y configuración | — |
| **F1 · Cimientos** | Módulos `finanzas` y `contabilidad`, plan/permiso, rol Contador; `cont_puc` (semilla), `fin_categorias` + mapeo, `fin_cuentas`, `fin_socios`, `cont_config`, régimen tributario en Datos básicos, ampliación de `medios_pago` (con `fin_tarifas_medio_pago`) y `proveedores`; pantalla de configuración inicial | F0 |
| **F2 · Movimientos y motor de asientos** | `fin_movimientos`, `cont_periodos`, `cont_asientos`/`lineas` con cuadre diferido; R1, R2, R9, R14, R16; vista administrativa "Registrar" e "Inicio"; libro diario básico | F1 |
| **F3 · Por cobrar, por pagar y socios** | `fin_documentos`, cuotas, `fin_abonos`; R3, R5, R6, R10, R11, R18–R20; pantallas de CxC, CxP y Socios (tarjeta y préstamos) | F2 |
| **F4 · Ingresos desde tratamientos y Bold** | Contabilización automática de tratamientos (R4, R5, R15) desde la fecha de activación + saldos iniciales; R7, R8, `fin_liquidaciones_pasarela`; pantalla Bold | F3 |
| **F5 · Facturas DIAN** | Parser XML/ZIP/Excel, `fin_facturas_compra`, `fin_importaciones`, bandeja y clasificación | F3 |
| **F6 · Activos fijos** | `act_activos`, R12, `act_depreciaciones`, hoja de vida (PDF) | F2 |
| **F7 · Mantenimiento** | Planes, ejecuciones, evidencias, cronograma, alertas, proveedora de Habilitación, enlace SG-SST | F6 |
| **F8 · Cierre y estados financieros** | Cierre mensual, depreciación R13, foto inmutable, Estado de Resultados y Balance, mayor y balance de prueba, exportes, dashboard contable, prellenado de suficiencia patrimonial | F4, F6 |
| **F9 · Supersalud y endurecimiento** | `cont_mapeo_cif`, FT003/FT004 desde CxC/CxP, generador FT001 cuando se tenga el instructivo; nómina → causación (R17); matriz RLS, privilegios, regresión completa | F8 + instructivo oficial |

Criterios de aceptación transversales:
1. Todo asiento cuadra; es imposible guardar uno descuadrado (prueba de BD).
2. El Balance cuadra (Activo = Pasivo + Patrimonio) en cualquier corte.
3. Un usuario sin conocimientos contables registra un gasto en menos de 30 segundos sin ver
   un código PUC.
4. Otra clínica no ve ni modifica nada; sin permiso de `contabilidad` no se ven asientos.
5. Un mes cerrado no cambia; reabrirlo queda auditado con motivo.
6. Importar dos veces la misma factura no la duplica.
7. Pagar con la tarjeta del socio deja la deuda con ese socio, visible hasta reembolsarla;
   un préstamo a o de un socio queda como cuenta por cobrar o por pagar, nunca como gasto o
   ingreso.
8. La liquidación de Bold deja el banco con el neto y la diferencia como gasto financiero;
   el neto esperado sale de la tarifa configurada en el medio de pago.

---

## 13. Riesgos

- **Normativa sin leer en la fuente** (§1): el mapeo PUC, las vidas útiles y el formato de
  la Supersalud deben ser confirmados por el contador antes de F1/F9.
- **Doble registro de ingresos**: si la clínica ya lleva contabilidad en otro software,
  activar la contabilización automática duplicaría; la fecha de activación y los saldos
  iniciales lo controlan.
- **Divisas**: la tasa digitada puede diferir de la TRM fiscal; se guardan ambas.
- **Bold**: sin API confirmada, la liquidación es manual (o por archivo); no se promete
  conciliación automática.
- **Volumen**: los estados se calculan de las líneas de asiento; con índices por
  (clinica_id, periodo, puc_codigo) es suficiente para clínicas pequeñas; la foto del
  cierre evita recalcular meses cerrados.

---

## 14. Preguntas para el contador / la clínica (bloquean F0)

Respondidas por el usuario (ver §15): 4 (Cuota Aptos), 5 (Prepagada), régimen (1, se
configura) y Supersalud (2, según la norma). Siguen abiertas las demás.

1. Forma jurídica y régimen (SAS ordinaria, SIMPLE, persona natural); grupo NIIF (2 o 3);
   ¿agente retenedor?
2. ¿La clínica reporta FT001/FT003/FT004 a la Supersalud? ¿En qué grupo está? ¿Debe usar
   el catálogo CIF como plan de cuentas o basta con mapearlo?
3. ¿Vende servicios estéticos gravados con IVA? (responsabilidad de IVA, prorrateo, cuenta
   de ingreso 4165/4170).
4. ¿Qué es exactamente **"Cuota Aptos"**? (administración de propiedad horizontal,
   cuotas de compra de un inmueble, o gastos de apartamentos de los socios).
5. **Prepagada**: ¿de empleados (beneficio laboral) o de socios?
6. Subcuentas que usa hoy su software contable; ¿insumos como inventario (1455) o gasto
   directo?
7. ¿Depreciación inmediata de activos ≤ 50 UVT? ¿Vidas útiles contables distintas de las
   fiscales?
8. Tarifas de retención que aplica la clínica y ReteICA del municipio.
9. Tarifa contratada con Bold; ¿abona a Cuenta Bold o a un banco? ¿Practica ReteICA?
   ¿Bold entrega reporte de liquidación (archivo) que podamos importar?
10. Política con los socios: ¿todo gasto con su tarjeta se reembolsa (2355)? ¿Se exige la
    factura a nombre de la clínica?
11. Tasa para EUR; ¿reexpresión mensual de la caja en divisas o solo al cierre del año?
12. ¿Desde qué fecha arranca la contabilidad en EWAH y con qué saldos iniciales (balance de
    apertura)?
13. ¿Los gastos se registran por sede? ¿Hay gastos compartidos que deban repartirse?

---

## 15. Decisiones del usuario (2026-10-07)

1. **"Cuota Aptos" se elimina.** En su lugar: movimientos de **préstamo a socio** (D 1325)
   y **préstamo de socio** (C 2355), con devoluciones como abonos (R18–R20).
2. **Prepagada = beneficio a los socios, que son empleados a término indefinido**: gasto de
   personal (5105) con el socio como tercero-empleado; queda por confirmar con el contador si
   se pacta como pago no constitutivo de salario.
3. **Régimen tributario configurable en "Datos básicos de la clínica"** (§4.10).
4. **FT001, FT002… según la norma**: la aplicabilidad la calcula el sistema con el perfil de
   Habilitación y las obligaciones ya sembradas, no una casilla manual (§4.10).
5. **Lo que cobra Bold (u otro medio) es personalizable por medio de pago**, para cobros y
   compras, con vigencia (`fin_tarifas_medio_pago`, R8 y R21). Tarifa que hoy le cobra Bold a
   la clínica (captura del usuario, "en saldo de ventas"):

   | Concepto | Valor | Campo |
   |---|---|---|
   | Tarifa estándar | 3,79 % + $300 | `porcentaje_comision` 3,79 · `valor_fijo_comision` 300 |
   | ReteRenta | 1,5 % | `porcentaje_retefuente` 1,5 |
   | ReteICA | 0,414 % (4,14 por mil) | `porcentaje_reteica` 0,414 |
   | ReteIVA | 0 % | `porcentaje_reteiva` 0 (la venta de salud no lleva IVA) |

   **La comisión ya incluye el IVA** (confirmado por el usuario). Ejemplo, cobro de
   $100.000: comisión $4.090 (IVA incluido), ReteRenta $1.500, ReteICA $414 → **neto
   $93.996**. Contablemente la comisión (y su IVA) van a gasto financiero 5305; ReteRenta y
   ReteICA **no son gasto**: son anticipos de impuestos que la clínica descuenta en su
   declaración (1355).
