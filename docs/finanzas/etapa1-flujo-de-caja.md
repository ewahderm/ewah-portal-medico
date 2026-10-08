# Etapa 1 · Flujo de caja (requerimientos detallados)

Fecha: 2026-10-07. Estado: **planeación, sin desarrollo**.
Visión completa (contabilidad NIIF, PUC, DIAN, activos, estados financieros):
`requerimientos-finanzas-contabilidad-activos.md`. Este documento acota **la primera parte**
a decisión del usuario: solo flujo de caja, pero construido para que la contabilidad se
monte encima sin rehacer nada (§2).

---

## 1. Qué resuelve

Que el administrador de la clínica sepa, sin conocimientos contables:
- **cuánta plata hay** hoy en cada cuenta (banco, Nequi, Daviplata, efectivo COP/USD/EUR),
- **cuánta entró y salió** en el mes, en qué y en qué sede,
- **cuánto viene en camino** (cobros de Bold por abonar) y **cuánto se le debe a cada socio**
  (gastos pagados con su tarjeta y préstamos),
- y que pueda registrar un gasto en menos de 30 segundos.

Dentro de la Etapa 1:
- cuentas de dinero con saldo inicial;
- categorías simples;
- registrar ingresos, egresos y transferencias (con divisas);
- ingresos automáticos desde los tratamientos;
- Bold (pendiente → liquidación neta con la tarifa del medio de pago);
- tarjeta del socio y préstamos con socios;
- tarifas por medio de pago;
- cierre mensual de caja (bloqueo del mes);
- tablero, informe de flujo de caja y exportación;
- alertas básicas.

Fuera de la Etapa 1 (siguientes etapas, ver §11):
- asientos y PUC visibles, estados financieros;
- cuentas por cobrar a pacientes en cuotas y por pagar a proveedores con vencimientos;
- importación DIAN, activos y depreciación, mantenimiento;
- régimen tributario e IVA descontable;
- reportes a la Supersalud.

---

## 2. Principios para que la contabilidad NIIF se monte encima

1. **Cada movimiento es un hecho completo e inmutable.** Guarda todo lo que un asiento
   necesitará después: fecha, tercero identificado, categoría, cuenta, sede, moneda, monto
   original, tasa, valor en COP, soporte y origen. Corregir es anular (con motivo) y volver
   a registrar.
2. **Las categorías ya llevan su cuenta PUC por defecto** (columna oculta en la Etapa 1). El
   día que llegue la contabilidad, una función genera los asientos de todo lo registrado
   desde la fecha de activación, sin pedirle nada al usuario.
3. **Cada categoría lleva su actividad de flujo de efectivo**: operación, inversión o
   financiación, como pide el estado de flujos de efectivo NIIF (Sección 7 de NIIF para
   Pymes, método directo). El informe de la Etapa 1 ya sale con esa estructura.
4. **Cuentas de dinero ≠ deudas.** La tarjeta del socio y "Bold por abonar" son cuentas que
   no son caja: una es un pasivo con el socio y otra un saldo por cobrar a la pasarela. El
   saldo disponible no las cuenta, pero quedan registradas para el balance.
5. **Hecho vs. pago.** El gasto pagado con la tarjeta del socio es un gasto del día en que se
   hace, aunque la plata salga de la clínica cuando se le reembolsa. Lo mismo con Bold: el
   ingreso es del día del cobro y el abono llega después. Así el informe muestra la caja real
   y la contabilidad podrá registrar por devengo (causación), como exige NIIF.
6. **Periodos que se cierran.** Un mes cerrado no admite movimientos; reabrir queda auditado.
7. **Impuestos capturados, no liquidados.** El movimiento puede guardar base, IVA y
   retenciones (opcionales). La Etapa 1 no los usa para calcular nada, pero así no se pierden.

---

## 3. Historias de usuario y criterios de aceptación

### HU-0 · Fecha de inicio (configurable en la aplicación)
Como administrador quiero elegir desde qué fecha la clínica lleva su flujo de caja en EWAH.
- La primera vez, un asistente de arranque en `/finanzas` (permiso EDIT): fecha de inicio →
  socios (Pro) → cuentas y su saldo a esa fecha → confirmar. Después se cambia en
  `/finanzas/configuracion`. La cuenta destino de cada medio de pago se configura en FC3,
  cuando los tratamientos empiecen a generar ingresos.
- Puede ser hoy o una fecha pasada (por ejemplo, el 1 de enero para cargar el año). No futura.
- Desde esa fecha nacen los ingresos automáticos de los tratamientos (HU-6): al fijarla en el
  pasado, el sistema genera de una vez los ingresos de los tratamientos ya registrados
  desde entonces y muestra cuántos y por cuánto antes de confirmar.
- Los saldos iniciales se guardan en cada cuenta (`fin_cuentas.saldo_inicial`), a la fecha de
  inicio. El saldo de una cuenta = saldo inicial + movimientos (FC2). La contabilidad los
  convertirá en el asiento de apertura.
- **Cambiar la fecha** solo mientras no haya un mes cerrado: se anulan y regeneran las
  aperturas y los ingresos automáticos (con confirmación y auditoría). Con meses cerrados,
  la fecha queda fija.
  - *Implementado en FC2/FC3:* la fecha se puede mover hacia atrás (con motivo e
    historial); los tratamientos del nuevo rango quedan "listos para poner al día" en
    Cobros, donde se ven cuántos y por cuánto antes de confirmar, y la pantalla avisa que
    hay que ajustar los saldos iniciales. Hacia adelante solo si no hay movimientos
    antes de la nueva fecha (la anulación y regeneración automática queda para FC6, con
    el cierre de mes).
- Nada con fecha anterior al inicio se puede registrar.

### HU-1 · Configurar cuentas de dinero
Como administrador quiero registrar las cuentas por donde se mueve la plata con su saldo
inicial.
- Tipos: Banco, Nequi, Daviplata, Efectivo, **Bold por abonar** y **Tarjeta de crédito de
  socio**. Moneda COP, USD o EUR (USD/EUR solo para Efectivo).
- Saldo inicial con fecha (el día de arranque); se registra como movimiento de apertura.
- Cada tarjeta de socio pide el socio dueño.
- Una cuenta con movimientos no se borra: se desactiva.
- Se pueden asignar a una sede (cajas por sede) o dejar como "General".
- Al activar el módulo se crean Efectivo COP y Banco principal.

### HU-2 · Socios
Como administrador quiero registrar a los socios para saber cuánto se les debe.
- Datos: identificación, nombre, % de participación (opcional) y, si es empleado, su ficha
  de RRHH (los socios son empleados a término indefinido).
- Ver por socio: lo que la clínica le debe (gastos con su tarjeta + préstamos que él hizo)
  y lo que él le debe a la clínica (préstamos a socio), con historial.

### HU-3 · Medios de pago con tarifa
Como administrador quiero decir a qué cuenta llega cada medio de pago y cuánto cobra.
- En Parámetros → Medios de pago, por medio:
  - cuenta destino;
  - si es pasarela (Bold);
  - si se usa en ingresos, egresos o ambos;
  - su **tarifa** con fecha de vigencia: comisión % (IVA incluido o no), valor fijo,
    ReteRenta %, ReteICA %, ReteIVA %, recargo internacional % y días hábiles de abono.
- Simulador: "de un cobro de $100.000 te llegan $X".
- Una tarifa nueva aplica desde su fecha. Lo ya liquidado no cambia.
- Semilla de ejemplo para Bold (tarifa actual del usuario):

  | Concepto | Valor |
  |---|---|
  | Comisión | 3,79 % + $300, **IVA incluido** |
  | ReteRenta | 1,5 % |
  | ReteICA | 0,414 % |
  | ReteIVA | 0 % |
  | Abono | 1 día hábil |

### HU-4 · Registrar un egreso ("Salió plata")
- Un solo formulario, en pasos y sin palabras contables:
  1. **¿Cuánto?** Monto y moneda; si es USD o EUR, la tasa a COP la digita el usuario y se
     ve el valor en COP.
  2. **¿En qué?** Tarjetas de categoría con icono y ayuda.
  3. **¿Con qué se pagó?** Cuentas activas. Si es la tarjeta de un socio: "Le quedará
     debiendo a <socio>".
  4. **Detalle:** a quién (proveedor existente, nuevo o texto libre), sede, fecha (por
     defecto hoy en hora de Colombia), descripción y soporte opcional (foto o PDF de la
     factura).
- Validaciones:
  - monto > 0;
  - tasa > 0 si no es COP;
  - fecha no futura y en un mes abierto;
  - la cuenta debe tener la moneda del movimiento;
  - si el saldo de efectivo quedaría negativo, aviso sin bloqueo.
- Si la categoría es Compra Activos: se pide nombre y clase del activo. Quedan listos para la
  hoja de vida de la etapa de activos.
- Si la categoría es Compra Insumos: opción de ir a recibir el lote en Inventario. No es
  obligatorio en la Etapa 1.

### HU-5 · Registrar un ingreso ("Entró plata")
- Igual que HU-4, con categorías de ingreso: Servicios (normalmente automáticos, HU-6),
  Otros ingresos, Préstamo de socio, Aporte de socio y Reintegros.
- Si el medio es Bold, queda **pendiente de abono** (HU-7).

### HU-6 · Ingresos automáticos desde tratamientos
- Cada tratamiento no anulado registrado desde la **fecha de activación** genera su ingreso,
  usando el valor del tratamiento y la cuenta del medio de pago. No se digita dos veces.
- Si el tratamiento se anula, el ingreso se anula. Si se corrige, se anula y se genera el
  nuevo.
- Tratamientos sin valor o con un medio de pago sin cuenta asignada: se listan como
  "ingresos por revisar" en el tablero y no se pierden.
- Medio "Crédito / cuotas": en la Etapa 1 se registra como **pendiente de cobro** (sin plan
  de cuotas). Se marca como recibido cuando el paciente paga. Las cuotas formales son de la
  etapa siguiente.
- *Implementado en FC3 (0093–0094):*
  - Configuración → Medios de pago: cada medio va a una cuenta en pesos, "a crédito" o
    "sin asignar" (tabla `fin_medios_pago`; el catálogo sigue en Parámetros).
  - El ingreso nace con la fecha del tratamiento, en Servicios de salud, sin el nombre del
    paciente. A una pasarela entra pendiente de abono (1 día hábil hasta FC4).
  - Finanzas nunca bloquea el registro clínico: si el ingreso falla, el tratamiento se
    guarda y queda por revisar.
  - Pantalla **Cobros**: por cobrar (crédito), listos para registrar, sin valor, medio sin
    cuenta, fecha futura y correcciones sin anular. "Poner al día" registra lo listo y
    anula ingresos de tratamientos anulados, fila por fila. "Registrar cobro" deja elegir
    cuenta, fecha y valor.
  - Al editar un tratamiento (la app crea el corregido y anula el original), un cobro
    registrado a mano pasa al corregido; un ingreso automático se anula y el corregido
    genera el suyo.
  - El ingreso de un tratamiento también se puede anular a mano (vuelve a Cobros).
  - Los nombres de pacientes en Cobros solo los ve quien tiene acceso a pacientes o
    tratamientos.

### HU-7 · Bold: cobro pendiente y liquidación
- El cobro con Bold entra a la cuenta "Bold por abonar" por el **bruto**, con fecha esperada
  de abono = fecha + días hábiles de la tarifa (con festivos).
- Pantalla Bold: cobros pendientes agrupados por día esperado, con el **neto esperado**
  calculado con la tarifa.
- **Liquidar** (uno o varios cobros):
  - el usuario confirma el neto que llegó al banco y adjunta el reporte de Bold (opcional);
  - el sistema registra la transferencia del neto al banco;
  - el egreso **Comisión pasarela** (comisión con IVA incluido; en categoría separada de
    "Retenciones que nos practicaron");
  - y la diferencia, si la hay, como "Diferencia en liquidación" con aviso.
- Ejemplo de $100.000:

  | Concepto | Valor |
  |---|---|
  | Comisión (IVA incluido) | $4.090 |
  | ReteRenta | $1.500 |
  | ReteICA | $414 |
  | **Neto** | **$93.996** |

- Las retenciones **no son gasto**: son anticipos de impuestos que la clínica descuenta en
  su declaración. Se guardan en su categoría (actividad de operación, cuenta 1355 por
  defecto) para que el contador las encuentre.

### HU-8 · Tarjeta de crédito del socio
- El egreso pagado con la tarjeta de un socio registra el gasto en su categoría y aumenta la
  **deuda con ese socio**. No baja ninguna cuenta de dinero de la clínica.
- **Reembolsar al socio**: transferencia desde una cuenta de la clínica hacia la tarjeta del
  socio. Es la salida real de caja y baja la deuda. Puede ser parcial.
- El tablero muestra la deuda total con socios y por socio.

### HU-9 · Préstamos con socios
- **Préstamo a socio** (sale plata): egreso de financiación que aumenta lo que el socio le
  debe a la clínica. **Sin intereses** (decisión de la clínica): el sistema no calcula ni
  causa intereses. Queda una nota informativa para el contador: la ley tributaria presume un
  interés mínimo en los préstamos de la sociedad a sus socios (art. 35 ET), que se trata en
  la declaración de renta, no en el flujo de caja.
- **Préstamo de socio** (entra plata): ingreso de financiación que aumenta lo que la clínica
  le debe al socio.
- Las devoluciones se registran desde la ficha del socio y bajan el saldo correspondiente.
  Ninguno de los dos es gasto ni ingreso del resultado.

### HU-10 · Transferencias entre cuentas
- Consignar efectivo en el banco, pasar de Nequi al banco, etc.
- Entre monedas distintas (comprar dólares, por ejemplo) pide la tasa.
- No es ingreso ni egreso: no aparece en el informe por categoría.

### HU-11 · Movimientos: consultar y anular
- Lista con filtros: fechas, tipo, categoría, cuenta, sede, socio y origen; búsqueda por
  texto.
- Detalle con el soporte (URL firmada).
- **Anular** con motivo de al menos 10 caracteres: crea el movimiento inverso. Los ingresos
  automáticos solo se anulan desde su tratamiento. No se edita ni se borra.

### HU-12 · Tablero e informe de flujo de caja
- Tablero:
  - saldo disponible por cuenta y total (USD/EUR convertidos con la última tasa usada);
  - entradas vs. salidas del mes y de los últimos 12 meses;
  - salidas por categoría;
  - Bold por abonar;
  - deuda con socios;
  - ingresos por revisar;
  - filtro de sede.
- **Informe de flujo de caja** de un rango de meses, en la estructura NIIF:
  - actividades de **operación** (cobros por servicios, pagos a proveedores y gastos,
    nómina, impuestos);
  - **inversión** (compra de activos);
  - **financiación** (préstamos y aportes de socios, reembolsos);
  - saldo inicial + variación = saldo final, que debe cuadrar con las cuentas.
- Exportación XLSX del informe y de los movimientos. PDF del informe mensual.

### HU-13 · Cierre mensual de caja
- Lista de verificación del mes:
  - Bold pendientes vencidos;
  - ingresos por revisar;
  - **arqueo**: saldo real contado de cada cuenta frente al saldo del sistema, con la
    diferencia registrada como "Sobrante/faltante de caja" con motivo.
- Cerrar el mes (permiso APPROVE) bloquea movimientos con fecha en ese mes. Queda una foto de
  saldos e informe.
- Reabrir exige motivo y queda auditado.

### HU-14 · Alertas (cron diario existente, una vez por plazo)
- Bold sin liquidar 2 días hábiles después de la fecha esperada.
- Deuda con un socio con más de 30 días.
- Mes anterior sin cerrar al día 10.
- Ingresos por revisar.

---

## 4. Categorías de la Etapa 1

Cada categoría tiene nombre visible, tipo (ingreso/egreso), actividad de flujo, cuenta PUC
por defecto (oculta en la Etapa 1, la confirma el contador en la etapa contable),
comportamiento e icono.

| Categoría | Tipo | Actividad | PUC por defecto (4) |
|---|---|---|---|
| Servicios de salud (automática desde tratamientos) | ingreso | operación | 4165 |
| Otros ingresos | ingreso | operación | 4295 |
| Reintegros / devoluciones recibidas | ingreso | operación | 4250 |
| Préstamo de socio | ingreso | financiación | 2355 |
| Aporte de socio | ingreso | financiación | 3105 |
| Compra Insumos | egreso | operación | 1455 |
| Arrendamiento | egreso | operación | 5120 |
| Nómina | egreso | operación | 5105 |
| Planilla (seguridad social) | egreso | operación | 2370 / 5105 |
| Servicios Públicos | egreso | operación | 5135 |
| Prepagada (socios-empleados) | egreso | operación | 5105 |
| Gasolina | egreso | operación | 5195 |
| IA & Redes Sociales | egreso | operación | 5235 / 5135 |
| Software & Página WEB | egreso | operación | 5135 |
| Impuestos | egreso | operación | 5115 / 2404 |
| Cámara de Comercio | egreso | operación | 5140 |
| Contabilidad | egreso | operación | 5110 |
| Habilitación & SGSST | egreso | operación | 5140 / 5110 / 5145 |
| Comisión pasarela (automática) | egreso | operación | 5305 |
| Retenciones que nos practicaron (automática) | egreso* | operación | 1355 |
| Compra Activos | egreso | **inversión** | 15xx |
| Préstamo a socio | egreso | **financiación** | 1325 |
| Reembolso a socio (automática) | transferencia | **financiación** | 2355 |
| Sobrante/faltante de caja (cierre) | ambos | operación | 4295 / 5195 |
| Otros Gastos | egreso | operación | 5195 |

\* Sale de la caja esperada pero no es gasto. El informe la muestra aparte.

- "Cuota Aptos" se eliminó (decisión del usuario).
- La clínica puede renombrar o desactivar categorías y crear las suyas. Una categoría
  propia exige elegir su actividad (operación, inversión o financiación); la cuenta PUC
  queda pendiente de que el contador la asigne en la etapa contable.

---

## 5. Modelo de datos (Etapa 1)

Convenciones: `clinica_id` + RLS (`clinica_actual()`, `has_permission('finanzas', …)`),
autoría forzada, auditoría, sin delete, importes `numeric(16,2)`, tasas `numeric(18,6)`.
Migraciones desde la siguiente libre (hoy 0089; confirmar al construir).

| Tabla | Campos clave | Notas |
|---|---|---|
| `fin_categorias` (global) | `codigo`, `nombre`, `tipo`, `actividad` (`operacion`/`inversion`/`financiacion`), `puc_codigo_defecto`, `comportamiento` (`gasto`, `ingreso`, `activo_fijo`, `inventario`, `anticipo_impuesto`, `prestamo_socio`, `aporte_socio`, `ajuste_caja`), `automatica`, `icono`, `ayuda`, `orden` | Semilla §4 |
| `fin_categorias_clinica` | `categoria_codigo` o propia (`nombre`, `tipo`, `actividad`), `activa`, `nombre_propio`, `puc_codigo` (null en Etapa 1) | Personalización |
| `fin_socios` | identificación, `nombre`, `porcentaje_participacion`, `empleado_id` (RRHH, opcional), `activo` | |
| `fin_cuentas` | `nombre`, `tipo` (`banco`, `nequi`, `daviplata`, `efectivo`, `pasarela`, `tarjeta_socio`), `moneda`, `socio_id` (si tarjeta), `banco_id`, `ultimos_digitos`, `sede_id`, `es_disponible` (falso para pasarela y tarjeta de socio), `puc_codigo_defecto` (1105/1110/1120/1345/2355), `activa` | Saldo calculado, no guardado |
| `medios_pago` (existente) | + `fin_cuenta_id`, `es_pasarela`, `es_credito`, `aplica_a` | |
| `fin_tarifas_medio_pago` | `medio_pago_id`, `vigente_desde`, `porcentaje_comision`, `comision_incluye_iva`, `valor_fijo_comision`, `porcentaje_retefuente`, `porcentaje_reteica`, `porcentaje_reteiva`, `recargo_internacional`, `dias_habiles_abono` | Histórico |
| `fin_movimientos` | `fecha`, `tipo` (`ingreso`, `egreso`, `transferencia`, `apertura`), `categoria`, `cuenta_id`, `cuenta_destino_id` (transferencias), `sede_id`, `tercero_tipo`/`tercero_id`/`tercero_nombre`, `socio_id`, `moneda`, `monto_original`, `tasa_cop`, `valor_cop` (generado), `monto_destino` + `tasa_destino` (transferencias entre monedas), `base`/`iva`/`retenciones` (opcionales), `descripcion`, `estado` (`registrado`, `pendiente_abono`, `por_cobrar`, `anulado`), `fecha_esperada`, `origen` (`manual`, `tratamiento`, `bold_liquidacion`, `reembolso_socio`, `cierre`), `origen_id`, `liquidacion_id`, `soporte_storage_path`/`nombre`, `anula_a`, `anulado_motivo`, `datos_activo jsonb` | Inmutable; unique (`origen`, `origen_id`) en automáticos |
| `fin_liquidaciones_pasarela` | `medio_pago_id`, `fecha`, `cuenta_banco_id`, `bruto`, `comision`, `retefuente`, `reteica`, `reteiva`, `neto_esperado`, `neto_real`, `diferencia`, `tarifa_id`, `soporte_storage_path` | La BD calcula y valida `bruto = neto_real + comisión + retenciones + diferencia` |
| `fin_config` | `clinica_id` pk, `fecha_inicio`, `activado_por/en`, `historial jsonb` (cambios de fecha con motivo) | HU-0 |
| `fin_periodos` | `anio`, `mes`, `estado`, `cerrado_por/en`, `reabierto_motivo`, `foto jsonb` (saldos e informe al cierre) | Lo heredará la contabilidad |
| `fin_arqueos` | `periodo_id`, `cuenta_id`, `saldo_sistema`, `saldo_contado`, `diferencia`, `movimiento_id` | |
| `fin_alertas_enviadas` | como las de SST | Idempotencia del cron |

Funciones (PostgreSQL):
- `fn_fin_saldos(fecha)`: saldo por cuenta.
- `fn_fin_flujo(desde, hasta, sede)`: informe por actividad y categoría, con saldo inicial y
  final.
- `fn_fin_registrar_desde_tratamiento`: trigger sobre `tratamientos`, alta y anulación.
- `fn_fin_liquidar_pasarela(ids, neto_real, …)`.
- `fn_fin_reembolsar_socio`.
- `fn_fin_cerrar_mes` / `fn_fin_reabrir_mes`.
- `fn_fin_alertas_pendientes`: para el cron.
- Definer solo las que lo necesiten, en una lista cerrada probada como en SG-SST.

Almacenamiento: bucket privado `finanzas` (`<clinica>/movimientos/<id>/…`, `…/liquidaciones/…`;
pdf, jpg, png, webp; 10 MB) con la subida firmada existente.

---

## 6. Reglas de negocio

| # | Regla |
|---|---|
| N1 | `valor_cop = round(monto_original × tasa_cop, 2)` lo calcula la BD; en COP la tasa es 1 |
| N2 | Saldo de una cuenta = Σ ingresos − Σ egresos ± transferencias de movimientos no anulados (y su anulación inversa) |
| N3 | Egreso con cuenta `tarjeta_socio`: la cuenta (no disponible) baja su saldo; su saldo negativo es la deuda con el socio |
| N4 | Reembolso: transferencia cuenta disponible → tarjeta del socio; no puede dejar la deuda en positivo (no se reembolsa de más) |
| N5 | Cobro con medio pasarela: ingreso a la cuenta pasarela con `estado = pendiente_abono` y `fecha_esperada = fn_hab_sumar_dias_habiles(fecha, dias)` |
| N6 | Liquidación (tarifa vigente a la fecha del cobro): `comisión = bruto × % + fijo` (si la tarifa no incluye IVA, `× 1,19`); `retenciones = bruto × %`; `neto_esperado = bruto − comisión − retenciones`; se generan transferencia (neto real), egreso comisión, egreso retenciones y, si `neto_real ≠ neto_esperado`, egreso o ingreso "Diferencia en liquidación" |
| N7 | Tratamiento nuevo no anulado con fecha ≥ activación y valor > 0 → ingreso; anulado → anulación del ingreso; medio sin cuenta → "por revisar" |
| N8 | Mes cerrado: ninguna inserción con fecha en él (trigger); reabrir exige APPROVE y motivo |
| N9 | Anular = movimiento inverso con `anula_a`; un movimiento anulado no se vuelve a anular; los automáticos solo se anulan desde su origen |
| N11 | Ningún movimiento con fecha anterior a `fin_config.fecha_inicio`; los ingresos automáticos solo para tratamientos con fecha ≥ inicio; cambiar la fecha solo sin meses cerrados (anula y regenera aperturas e ingresos automáticos) |
| N10 | Sin tasa no hay movimiento en divisa; si la tasa difiere más del 10 % de la última usada, se pide confirmación |

---

## 7. Permisos y planes

- Módulo RBAC **`finanzas`**:
  - VIEW: tablero e informes;
  - CREATE: registrar;
  - EDIT: configurar cuentas, socios y tarifas;
  - VOID: anular;
  - APPROVE: cerrar o reabrir el mes;
  - EXPORT.
- Backfill: administrador (nivel 1) con todo.
- Plan **Gratis**: cuentas, registrar, tablero del mes.
- Plan **Pro** (`gestion`): Bold y tarifas, socios y préstamos, cierre mensual, informe NIIF,
  exportes y alertas.
- La contabilidad (etapa siguiente) será otro módulo (`contabilidad`) con su rol Contador.

---

## 8. Pantallas

- `/finanzas`: tablero (HU-12) con los botones grandes **Entró plata** y **Salió plata**.
- `/finanzas/movimientos`: lista, detalle y anular.
- `/finanzas/bold`: pendientes y liquidar.
- `/finanzas/socios`: deuda y préstamos por socio, reembolsar y devolver.
- `/finanzas/informe`: flujo de caja por actividades; exportar.
- `/finanzas/cierre`: arqueo, cerrar y reabrir.
- `/finanzas/configuracion`: cuentas y saldos iniciales, socios, categorías.
- Parámetros → Medios de pago: cuenta destino y tarifa con simulador.
- Componentes:
  - `RegistrarMovimientoDialog`, `SelectorCategoria`, `SelectorCuenta`, `CampoMonedaTasa`;
  - `TransferenciaDialog`, `LiquidarPasarelaDialog`, `ReembolsoSocioDialog`, `PrestamoSocioDialog`;
  - `TarifaMedioPagoDialog`, `TableroFlujo`, `InformeFlujoNiif`, `CierreMesForm`.
- Patrones de la app: Base UI, toasts, fechas en hora de Colombia, móvil a 390 px sin
  scroll horizontal y gráficos según la guía de visualización.

---

## 9. Pruebas (como Habilitación y SG-SST)

- **BD** (`bd-local/fin*`):
  - saldos y anulaciones;
  - tarjeta de socio y reembolso parcial (sin reembolsar de más);
  - liquidación de Bold con la tarifa de ejemplo ($100.000 → $93.996) y con diferencia;
  - ingreso automático al crear y al anular un tratamiento;
  - mes cerrado bloqueado;
  - divisas;
  - aislamiento entre clínicas;
  - sin permiso, nada;
  - lista cerrada de RPC definer.
- **Vitest**: cálculo de tarifa y neto, conversión de divisas y redondeo, agrupación del
  informe por actividad, días hábiles de abono.
- **Navegador**: registrar gasto en COP y en USD, tarjeta de socio → reembolso, cobro Bold →
  liquidar, informe que cuadra con los saldos, cierre y reapertura, móvil a 390 px y consola
  limpia.

---

## 10. Fases de construcción de la Etapa 1

| Fase | Contenido |
|---|---|
| FC1 · Cimientos | Módulo y permisos, asistente de arranque con **fecha de inicio configurable**, categorías (global y clínica), cuentas con saldo inicial, socios |
| FC2 · Movimientos | Registrar ingreso, egreso y transferencia; divisas; soporte; lista y anulación; tablero básico |
| FC3 · Ingresos desde tratamientos | Trigger, medios de pago → cuenta, "por revisar", activación |
| FC4 · Bold y tarifas | Tarifas por medio con simulador, pendientes, liquidación |
| FC5 · Socios | Tarjeta del socio, reembolsos y préstamos |
| FC6 · Informe, cierre y alertas | Informe NIIF por actividades, exportes, arqueo, cierre/reapertura, alertas, endurecimiento y regresión |

---

## 11. Lo que viene después (sobre esta base)

1. **Etapa 2 · Por cobrar y por pagar**: cuotas de pacientes, proveedores con vencimiento,
   importación de facturas DIAN, régimen tributario en Datos básicos.
2. **Etapa 3 · Contabilidad NIIF**: catálogo PUC y subcuentas, asientos generados desde los
   movimientos de la Etapa 1 (incluida la historia desde la activación), vista del
   contador, Estado de Resultados y Balance, cierre contable sobre `fin_periodos`.
3. **Etapa 4 · Activos y mantenimiento**: hoja de vida a partir de las compras de activos ya
   registradas, depreciación, cronograma integrado con Habilitación y SG-SST.
4. **Etapa 5 · Supersalud**: FT001… según la norma.

Decisiones del usuario: la **fecha de inicio se configura en la aplicación** (HU-0) y los
**préstamos con socios no generan intereses** (HU-9). Pregunta que queda para el contador,
sin bloquear la Etapa 1: si la prepagada se pacta como pago no salarial (solo cambia la
cuenta contable, no el flujo).

---

## 12. Estado de la implementación (Etapa 1 terminada)

Las seis fases están construidas en `staging`. Migraciones **0089 a 0100**:

| Migración | Contenido |
|---|---|
| 0089–0090 | FC1: módulo `finanzas`, `fin_config` (fecha de inicio con historial), categorías, cuentas, socios, asistente `fn_fin_activar` |
| 0091–0092 | FC2: `fin_movimientos` inmutable, anulación por movimiento inverso, saldos, soportes en el bucket `finanzas` |
| 0093–0094 | FC3: `fin_medios_pago`, ingreso automático desde tratamientos, Cobros (por cobrar / por revisar), puesta al día |
| 0095, 0097 | FC4: `fin_tarifas_medio_pago`, liquidación de la pasarela (`fin_liquidaciones_pasarela`, `fin_liquidacion_cobros`) |
| 0096, 0099 | FC5: saldos por socio, reembolso de la tarjeta, préstamos y devoluciones con tope |
| 0098, 0100 | FC6: informe por actividades, cierre mensual con arqueo (`fin_periodos`, `fin_arqueos`), alertas (`fin_alertas_enviadas`); reabrir rehace el arqueo y un tratamiento de un mes cerrado entra el primer día abierto |

Pantallas: Inicio, Movimientos, Cobros, Bold, Socios, Informe, Cierre y Configuración
(General, Cuentas, **Medios de pago con tarifa y simulador**, Socios, Categorías).

Decisiones tomadas al construir (difieren del texto original o lo precisan):
- La cuenta destino y la tarifa de cada medio de pago se configuran en **Flujo de caja →
  Configuración → Medios de pago** (no en Parámetros), para no mezclar permisos.
- Una tarifa usada en una liquidación vigente no se edita ni se borra: se registra una nueva
  con otra fecha de vigencia. Si un medio no tiene tarifa, el cobro usa la de otro medio que
  llega a la misma pasarela.
- Un cobro ya liquidado no se anula suelto: primero se anula la liquidación. Si su
  tratamiento se anula, queda "por revisar" (anulado con el cobro ya abonado).
- El informe es de **efectivo** (cuentas disponibles), método directo, con el **neto por
  categoría** (las anulaciones se compensan). La pasarela y las tarjetas de socios no son
  efectivo: el abono de la pasarela entra como cobro de operación y el reembolso a un socio
  sale como financiación. Las divisas se convierten con la última tasa usada; la diferencia
  aparece como "efecto de la tasa de cambio".
- El cierre es en orden (desde el mes del inicio) y solo de meses terminados; se reabre el
  último cerrado, con motivo. Con meses cerrados la fecha de inicio queda fija. Un
  tratamiento con fecha en un mes cerrado se guarda y su ingreso queda pendiente.
- Las alertas (plan Pro) van a los usuarios de nivel 1 o con permiso de aprobar en Flujo de
  caja; los ingresos por revisar se avisan una vez por semana.
- Exportes (Excel del informe y de movimientos, PDF del informe) con el permiso EXPORT de
  Flujo de caja y plan Pro.

Pruebas: `scripts/habilitacion/bd-local/probar.sh` (BD, fin1–fin6), vitest
(`apps/web/lib/finanzas/__tests__`) y la regresión en navegador
`scripts/finanzas/regresion.sh` (recorridos FC1–FC6, escritorio y móvil a 390 px).

Pendiente para etapas siguientes: cuotas de pacientes y por pagar (Etapa 2), contabilidad
sobre estos movimientos (Etapa 3), N10 (aviso cuando una tasa se aleja más del 10 % de la
última usada) y el recargo internacional de la tarifa (se guarda pero el cobro no dice si la
tarjeta es extranjera).
