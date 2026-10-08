import type { Guia } from "@/lib/manual/tipos";

export const FINANZAS_INICIO: Guia = {
  slug: "flujo-de-caja",
  titulo: "Flujo de caja: activación, cuentas y movimientos",
  resumen: "Activa el módulo con tu fecha de inicio y saldos, y registra lo que entra, lo que sale y las transferencias.",
  grupo: "Flujo de caja",
  icono: "wallet",
  ruta: "/finanzas",
  secciones: [
    {
      id: "activar",
      titulo: "Actívalo con el asistente",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "Entra a **Operación → Flujo de caja**. La primera vez aparece el asistente.",
            "Elige la **fecha de inicio**: desde cuándo llevas la caja en EWAH (hoy o una fecha pasada, por ejemplo el 1 de enero).",
            "Si tu plan es Pro, registra a los **socios** (para sus tarjetas y préstamos).",
            "Crea tus **cuentas** con el saldo que tenían en la fecha de inicio: efectivo, bancos, Nequi, Daviplata, la pasarela de pago (Bold, Wompi…) y la tarjeta de crédito de cada socio.",
            "Confirma. Desde ese día los tratamientos entran solos al flujo de caja.",
          ],
        },
        { tipo: "nota", tono: "info", texto: "La fecha de inicio se puede cambiar después (con motivo) en **Configuración → General**, mientras no hayas cerrado ningún mes." },
      ],
    },
    {
      id: "tablero",
      titulo: "El tablero",
      bloques: [
        {
          tipo: "texto",
          texto:
            "El **Inicio** muestra lo disponible en pesos y divisas, lo que está por abonar en la pasarela, lo que se les debe a los socios por sus tarjetas, lo que está por cobrar a pacientes, lo que entró y salió en el mes (y en qué se fue la plata), los últimos movimientos y el saldo de cada cuenta.",
        },
        { tipo: "imagen", archivo: "finanzas.jpg", alt: "Tablero del flujo de caja" },
      ],
    },
    {
      id: "registrar",
      titulo: "Registra entradas, salidas y transferencias",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "Pulsa `Entró plata`, `Salió plata` o `Pasar entre cuentas`.",
            "Escribe el **monto** (en dólares o euros pide la tasa a pesos).",
            "Elige la **categoría** (arrendamiento, nómina, insumos, préstamo a socio…) y la **cuenta**.",
            "Completa a quién se le pagó o quién pagó, la sede, la fecha, una nota y, si quieres, la foto o el PDF de la factura.",
            "Pulsa `Registrar`.",
          ],
        },
        { tipo: "imagen", archivo: "finanzas-registrar.jpg", alt: "Registrar una salida de plata" },
        {
          tipo: "nota",
          tono: "info",
          texto: "Un gasto pagado con la **tarjeta de un socio** no baja la caja: queda como deuda con ese socio hasta que se le reembolse.",
        },
      ],
    },
    {
      id: "movimientos",
      titulo: "Consulta y anula movimientos",
      bloques: [
        {
          tipo: "texto",
          texto:
            "En **Movimientos** filtras por fechas, tipo, cuenta y categoría. Un movimiento no se edita ni se borra: `Anular` (con motivo) crea el movimiento inverso que lo compensa.",
        },
        { tipo: "imagen", archivo: "finanzas-movimientos.jpg", alt: "Lista de movimientos" },
      ],
    },
  ],
};

export const FINANZAS_COBROS: Guia = {
  slug: "cobros-y-bold",
  titulo: "Cobros de tratamientos y pasarelas de pago",
  resumen:
    "Qué pasa con cada cobro desde que registras el tratamiento hasta que la plata llega al banco: medios de pago, cobros pendientes, link de pago, reporte de la pasarela (Bold, Wompi, PayU…) y liquidación.",
  grupo: "Flujo de caja",
  icono: "credit-card",
  ruta: "/finanzas/cobros",
  secciones: [
    {
      id: "recorrido",
      titulo: "El recorrido de un cobro con pasarela",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Una **pasarela de pago** (Bold, Wompi, PayU…) es la empresa que procesa los pagos con tarjeta, datáfono o link de pago. La pasarela **no te consigna al instante ni pago por pago**: unos días después te hace **un solo abono al banco con varios pagos juntos**, ya descontada su comisión y las retenciones. Por eso EWAH sigue el cobro en cuatro momentos.",
        },
        {
          tipo: "pasos",
          pasos: [
            "**Registras el tratamiento** con un medio de pago que va a la pasarela (por ejemplo Datáfono o Link de pago). Ejemplo: una consulta de $2.840.000 pagada con tarjeta Visa.",
            "**El cobro queda pendiente de abono.** El ingreso se anota en la cuenta de la pasarela por el valor completo. Es plata tuya, pero todavía no está en tu banco.",
            "**La pasarela te abona** al banco un total que junta varios pagos y ya trae descontadas la comisión y las retenciones. Del ejemplo, llegan $2.686.226,40 y quedan $153.773,60 de deducciones.",
            "**Tú liquidas.** Marcas los cobros que incluía ese abono y confirmas cuánto llegó. EWAH pasa la plata de la pasarela al banco y registra aparte la comisión y las retenciones.",
          ],
        },
        {
          tipo: "lista",
          items: [
            "**Cobrado (bruto):** el valor completo que pagó el paciente.",
            "**Comisión:** lo que cobra la pasarela por procesar el pago (un porcentaje más un valor fijo, con IVA incluido). Cambia según el tipo de tarjeta y la franquicia.",
            "**Retenciones:** impuestos que la pasarela te descuenta y entrega a la DIAN y al municipio (retención en la fuente, ReteICA, ReteIVA). **No son un gasto**: son un anticipo que descuentas en tu declaración.",
            "**Neto:** lo que realmente te llega al banco = cobrado − comisión − retenciones.",
            "**Abono:** la transferencia que la pasarela hace a tu banco.",
            "**Liquidar:** confirmarle a EWAH que un abono llegó, para que cierre esos cobros pendientes.",
          ],
        },
        {
          tipo: "nota",
          tono: "info",
          texto:
            "Mientras un cobro está **pendiente de abono**, la plata cuenta como \"en camino\" y no como dinero disponible en el banco. Se vuelve disponible cuando liquidas.",
        },
      ],
    },
    {
      id: "medios",
      titulo: "Primero: a dónde va cada medio de pago",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Para que EWAH sepa qué hacer con un cobro, cada medio de pago de tu clínica necesita un destino. Se configura una sola vez.",
        },
        {
          tipo: "pasos",
          pasos: [
            "Primero crea la **cuenta de la pasarela** en **Flujo de caja → Configuración → Cuentas** con el tipo **Pasarela de pago**. Si usas más de una pasarela, crea una cuenta por cada una.",
            "Ve a **Configuración → Medios de pago**. Para cada medio (efectivo, datáfono, link de pago, transferencia…) elige la cuenta a la que llega la plata, **A crédito** (queda por cobrar) o **Sin asignar**.",
            "Los medios que pasan por una pasarela se asignan a **la cuenta de esa pasarela**. Cada pasarela tiene sus propios medios y sus propias tarifas.",
            "En esos medios pulsa `Tarifa` y escribe lo que te cobra la pasarela: comisión %, valor fijo, si incluye IVA, retenciones y días hábiles de abono. `Usar la tarifa estándar de Bold` la llena por ti. El simulador te muestra cuánto llega de un cobro de ejemplo.",
          ],
        },
        {
          tipo: "nota",
          tono: "info",
          texto:
            "**Medio de pago ≠ pasarela.** El medio de pago es *cómo paga el paciente* (tarjeta de crédito, tarjeta de débito, link de pago, PSE, efectivo…). La pasarela es *quién procesa ese pago* (Bold, Wompi…). En EWAH cada medio apunta a una sola cuenta: si todo lo cobras con una pasarela, deja los medios con su nombre normal y asígnalos a la cuenta de esa pasarela. Si usas **dos o más pasarelas**, pon la pasarela en el nombre del medio (por ejemplo \"Tarjeta de crédito (Bold)\" y \"Tarjeta de crédito (Wompi)\") para que el personal elija bien al registrar el tratamiento.",
        },
        {
          tipo: "nota",
          tono: "info",
          texto:
            "La tarifa es una **estimación**: sirve para calcular cuánto debería llegar y cuándo. Si subes el reporte de la pasarela (más abajo), EWAH usa los valores **reales** de cada pago y deja de depender de la tarifa.",
        },
        { tipo: "imagen", archivo: "finanzas-medios.jpg", alt: "Medios de pago y su cuenta" },
      ],
    },
    {
      id: "cobros",
      titulo: "La pantalla Cobros: qué significa cada cosa",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Cada tratamiento con valor entra **solo** al flujo de caja como ingreso de **Servicios de salud**, sin que hagas nada, siempre que su medio de pago tenga cuenta. Lo que no pudo entrar aparece en **Cobros**. Arriba eliges qué ver:",
        },
        {
          tipo: "lista",
          items: [
            "**Pendientes** (la vista por defecto): tratamientos que aún no entraron. Cada fila lleva la marca *Pendiente*.",
            "**Ya en el flujo:** tratamientos cuyo ingreso ya está registrado (marca *Ya en el flujo*; se muestran los 200 más recientes).",
            "**Excluidos:** tratamientos que decidiste no meter en el flujo (marca *Excluido*), con su motivo.",
          ],
        },
        {
          tipo: "texto",
          texto: "Dentro de **Pendientes**, cada sección te dice por qué el tratamiento no ha entrado y qué hacer:",
        },
        {
          tipo: "lista",
          items: [
            "**Listos para registrar:** su medio ya tiene cuenta. Pulsa `Poner al día` y entran todos de una vez.",
            "**Medio de pago sin cuenta:** el medio de pago no tiene destino. Asígnalo en Configuración y pulsa `Poner al día`, o registra el cobro de cada uno a mano.",
            "**Por cobrar:** tratamientos a crédito. Cuando el paciente pague, pulsa `Registrar cobro` y elige la cuenta, la fecha y el valor.",
            "**Esperando confirmación de la pasarela:** medios (como el link de pago) que esperan que confirmes que se pagó. Ver la siguiente sección.",
            "**Sin valor:** el tratamiento no tiene valor. Corrígelo en Tratamientos o registra aquí lo que se cobró.",
            "**Con fecha futura:** entrarán cuando llegue su fecha, al poner al día.",
            "**Corregidos sin anular / Anulados:** casos de tratamientos corregidos o anulados que piden que revises cuál de los registros sobra.",
          ],
        },
        {
          tipo: "pasos",
          pasos: [
            "Si un tratamiento **no debe generar ingreso** (una cortesía, un registro de prueba, algo que se cobró fuera de la clínica), pulsa `No meter en el flujo` y escribe el motivo.",
            "El tratamiento **no se borra ni se modifica**: solo sale de los pendientes y aparece en **Excluidos**. Desde allí puedes `Volver a incluir` cuando quieras.",
          ],
        },
        {
          tipo: "nota",
          tono: "aviso",
          texto:
            "Un tratamiento que **ya entró** al flujo no se puede excluir. Si entró por error, primero se anula su ingreso en **Movimientos** (con permiso para anular) y después vuelve a Pendientes.",
        },
        { tipo: "imagen", archivo: "finanzas-cobros.jpg", alt: "Cobros pendientes, ya en el flujo y excluidos" },
      ],
    },
    {
      id: "confirmacion",
      titulo: "Link de pago: esperar la confirmación",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Con un **datáfono**, cuando registras el tratamiento el paciente ya pagó. Con un **link de pago** no: el link se envía, el paciente puede pagar horas después o no pagar. Para no anotar como ingreso un pago que no ocurrió, activa la confirmación en ese medio.",
        },
        {
          tipo: "pasos",
          pasos: [
            "En **Configuración → Medios de pago**, en el medio \"Link de pago\" (que debe ir a la cuenta de la pasarela) marca **Esperar la confirmación de la pasarela**.",
            "Desde ese momento, los tratamientos con ese medio **no entran solos**: quedan en **Cobros → Esperando confirmación de la pasarela**.",
            "Cuando la pasarela te avise que el pago se hizo, pulsa `Confirmar pago` y escribe la fecha en que la pasarela cobró. El ingreso entra a la pasarela como **pendiente de abono**.",
            "Si el paciente no pagó, pulsa `No se pagó` y deja el motivo. El tratamiento sale del flujo y queda en **Excluidos**. Si el paciente paga después, lo vuelves a incluir desde allí.",
          ],
        },
        {
          tipo: "nota",
          tono: "info",
          texto:
            "Si subes el reporte de la pasarela, **no necesitas confirmar uno por uno**: el reporte confirma automáticamente los tratamientos cuyo pago aparece como exitoso (ver la siguiente sección).",
        },
      ],
    },
    {
      id: "reporte",
      titulo: "Subir el reporte de la pasarela (recomendado)",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Cada pasarela te deja descargar un **reporte de transacciones** con todos los pagos: su estado, la comisión y las retenciones exactas de cada uno, y lo que se deposita. Subirlo a EWAH hace tres cosas: **confirma que el cobro se realizó**, **empareja cada pago con su cobro** y hace que al liquidar el neto esperado sea **exacto** (no una estimación).",
        },
        {
          tipo: "pasos",
          pasos: [
            "Descarga el reporte de transacciones desde el panel de tu pasarela, **sin editarlo ni quitar columnas**.",
            "Entra a **Flujo de caja → Pasarelas**, a la tarjeta **Reporte de la pasarela**. Si tienes varias pasarelas, elige de cuál es el reporte.",
            "Elige el archivo (Excel o texto). Antes de importar ves un resumen: cuántos pagos leyó, cuánto cobró, cuánta comisión y retenciones, y cuánto se deposita. Si alguna fila no cuadra, te la señala y no la importa.",
            "Pulsa `Importar y emparejar`. EWAH liga cada pago exitoso con su cobro.",
          ],
        },
        {
          tipo: "lista",
          items: [
            "**Cómo empareja:** busca el cobro pendiente de abono de esa pasarela con **el mismo valor** y una **fecha cercana** (de unos días antes a un par de días después del pago). Si hay un único candidato, los une solo. También confirma el tratamiento que esperaba la confirmación.",
            "**Varios cobros iguales:** si hay dos cobros del mismo valor, EWAH **no adivina**. El pago queda en **Pagos sin su cobro** y eliges tú el cobro correcto en la lista y pulsas `Emparejar`.",
            "**Sin cobro:** si un pago de la pasarela no tiene ningún cobro posible, aparece con el aviso *Sin cobro del mismo valor y fecha cercana*. Suele significar que falta registrar ese tratamiento (o que su valor o fecha son muy distintos).",
            "**Pagos no exitosos:** se guardan pero no se emparejan ni generan ingreso.",
            "**Un cobro emparejado** muestra la marca *valores reales* en la lista de pendientes de abono.",
          ],
        },
        {
          tipo: "nota",
          tono: "info",
          texto:
            "Puedes subir el mismo reporte varias veces sin duplicar nada: los pagos ya importados se reconocen por su número de transacción. El archivo se lee en tu navegador y **no se guardan** el número de la tarjeta ni el nombre o correo del pagador.",
        },
        {
          tipo: "nota",
          tono: "pro",
          texto: "Importar el reporte, las tarifas y la liquidación de las pasarelas son del plan Pro.",
        },
      ],
    },
    {
      id: "bold",
      titulo: "Liquidar el abono que llegó al banco",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Cuando la pasarela te hace un abono, entra a **Flujo de caja → Pasarelas**. Los cobros pendientes de abono aparecen agrupados por el día en que se espera la plata, cada uno con el **neto** que debería llegar.",
        },
        {
          tipo: "pasos",
          pasos: [
            "Mira tu extracto del banco y **marca los cobros que incluye ese abono**. Abajo ves cuántos marcaste, el cobrado y el **neto esperado**. Debe parecerse a lo que te llegó.",
            "Pulsa `Liquidar`. Elige la cuenta del banco a la que llegó, la **fecha del abono** y escribe **cuánto llegó** realmente.",
            "Adjunta el reporte o el comprobante de la pasarela si quieres dejarlo como soporte.",
            "Al confirmar, EWAH registra: el **abono** de la pasarela al banco, la **comisión**, las **retenciones** (como anticipo de impuestos, no gasto) y, si hay, la **diferencia**. Los cobros dejan de estar pendientes.",
          ],
        },
        {
          tipo: "lista",
          items: [
            "**Con el reporte subido:** el neto esperado es la suma exacta de lo que la pasarela depositó por esos pagos. Si lo que llegó al banco es igual, **no queda diferencia**.",
            "**Sin el reporte:** el neto esperado se calcula con tu tarifa, que es una estimación. Si llega un valor distinto (porque cambió la franquicia o la comisión), la diferencia se registra como un **ajuste de caja** para que el banco cuadre.",
            "**Solo una pasarela a la vez:** no mezcles en una misma liquidación cobros de pasarelas distintas.",
            "**Si te equivocaste:** puedes `Anular` la liquidación (con motivo). Los cobros vuelven a estar pendientes y la liquidación queda en el historial.",
          ],
        },
        { tipo: "imagen", archivo: "finanzas-bold.jpg", alt: "Pasarelas: pendientes de abono y liquidaciones" },
      ],
    },
    {
      id: "preguntas",
      titulo: "¿Qué hago si…?",
      bloques: [
        {
          tipo: "lista",
          items: [
            "**Registré un tratamiento y no aparece en Ingresos.** Revisa **Cobros → Pendientes**: allí dice por qué (medio sin cuenta, a crédito, esperando confirmación, sin valor o fecha futura). Lo más común es un medio de pago sin cuenta asignada.",
            "**La pasarela me cobró pero no encuentro el tratamiento.** Sube el reporte: el pago aparece en *Pagos sin su cobro* con aviso de que no tiene cobro. Registra el tratamiento que falta y vuelve a subir el mismo reporte: no duplica nada y empareja el pago con el cobro nuevo.",
            "**Llegó menos plata de la esperada.** Si no subiste el reporte, puede ser otra franquicia o tarjeta con comisión distinta: sube el reporte para ver el valor real. Si aun así no cuadra, revisa que marcaste exactamente los cobros del abono.",
            "**El paciente no pagó el link.** Usa `No se pagó` en *Esperando confirmación de la pasarela* (si el medio tiene la confirmación activa) o `No meter en el flujo`.",
            "**Tengo dos pasarelas.** Crea una cuenta de tipo *Pasarela de pago* por cada una, asigna a cada medio de pago su cuenta y sube cada reporte eligiendo su pasarela. Liquida cada una por separado.",
            "**Anulé un tratamiento cuyo cobro ya se liquidó.** Aparece en *Anulados con el cobro ya abonado*: la pasarela ya pagó esa plata. Si le devolviste el dinero al paciente, registra la salida; si fue un error de la liquidación, anúlala en Pasarelas y pon al día.",
            "**El mes ya está cerrado.** Un ingreso nuevo de un mes cerrado entra en el primer día abierto y lo indica en su descripción.",
          ],
        },
      ],
    },
  ],
};

export const FINANZAS_SOCIOS_CIERRE: Guia = {
  slug: "socios-informe-y-cierre",
  titulo: "Socios, informe NIIF y cierre del mes",
  resumen: "Reembolsos y préstamos con socios, el informe de flujo de efectivo por actividades con exportes y el cierre mensual con arqueo.",
  grupo: "Flujo de caja",
  icono: "chart",
  ruta: "/finanzas/informe",
  secciones: [
    {
      id: "socios",
      titulo: "Socios",
      bloques: [
        {
          tipo: "texto",
          texto:
            "En **Socios** ves por cada socio lo que la clínica le debe (gastos con su tarjeta y préstamos que él hizo) y lo que él le debe a la clínica. Desde su tarjeta: `Reembolsar tarjeta`, `Prestarle`, `Nos presta`, `Nos devuelve` y `Le devolvemos`.",
        },
        { tipo: "imagen", archivo: "finanzas-socios.jpg", alt: "Socios con su deuda y préstamos" },
        { tipo: "nota", tono: "info", texto: "Nunca se reembolsa ni se devuelve más de lo pendiente. Los préstamos con socios no generan intereses." },
      ],
    },
    {
      id: "informe",
      titulo: "Informe de flujo de efectivo",
      bloques: [
        {
          tipo: "texto",
          texto:
            "El **Informe** presenta el efectivo por actividades (NIIF para Pymes, sección 7): **operación**, **inversión** y **financiación**, con el efectivo al inicio, la variación y el efectivo al final, que cuadra con tus cuentas. Elige el rango de meses y la sede, y descarga el **Excel** (informe y movimientos) o el **PDF**.",
        },
        { tipo: "imagen", archivo: "finanzas-informe.jpg", alt: "Informe de flujo de efectivo por actividades" },
      ],
    },
    {
      id: "cierre",
      titulo: "Cierre del mes con arqueo",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "En **Cierre** aparece el siguiente mes por cerrar (se cierran en orden).",
            "Revisa la verificación: cobros de Bold sin liquidar e ingresos por revisar.",
            "Cuenta la plata de cada cuenta al último día del mes y escribe lo **contado**. Si no cuadra, explica la diferencia: queda como sobrante o faltante de caja.",
            "Pulsa `Cerrar <mes>`. Ese mes ya no admite movimientos.",
          ],
        },
        { tipo: "imagen", archivo: "finanzas-cierre.jpg", alt: "Cierre del mes con arqueo" },
        {
          tipo: "nota",
          tono: "aviso",
          texto: "Para corregir un mes cerrado, `Reabrir` el último cerrado con un motivo (queda en el historial y el arqueo se rehace al cerrar otra vez).",
        },
        {
          tipo: "nota",
          tono: "info",
          texto: "Con el plan Pro, quien puede cerrar el mes recibe alertas por correo: Bold sin abonar, deudas con socios de más de 30 días, el mes anterior sin cerrar al día 10 e ingresos por revisar.",
        },
      ],
    },
  ],
};
