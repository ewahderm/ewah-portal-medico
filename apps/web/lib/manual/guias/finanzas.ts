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
            "Crea tus **cuentas** con el saldo que tenían en la fecha de inicio: efectivo, bancos, Nequi, Daviplata, la pasarela (Bold) y la tarjeta de crédito de cada socio.",
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
  titulo: "Cobros de tratamientos y Bold",
  resumen: "A qué cuenta llega cada medio de pago, cobros por revisar y por cobrar, tarifas de la pasarela y liquidación de Bold.",
  grupo: "Flujo de caja",
  icono: "credit-card",
  ruta: "/finanzas/cobros",
  secciones: [
    {
      id: "medios",
      titulo: "Medios de pago y tarifas",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "En **Flujo de caja → Configuración → Medios de pago**, elige para cada medio la cuenta a la que llega la plata, **A crédito** (queda por cobrar) o **Sin asignar**.",
            "Para la pasarela (por ejemplo Bold), pulsa `Tarifa`: comisión %, valor fijo, si incluye IVA, ReteRenta, ReteICA, ReteIVA y días hábiles de abono. `Usar la tarifa estándar de Bold` la llena por ti.",
            "El simulador muestra cuánto te llega: de un cobro de $100.000 con la tarifa de Bold llegan $93.996.",
          ],
        },
        { tipo: "imagen", archivo: "finanzas-medios.jpg", alt: "Medios de pago y su cuenta" },
      ],
    },
    {
      id: "cobros",
      titulo: "Cobros: por revisar y por cobrar",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Cada tratamiento con valor entra solo como ingreso de **Servicios de salud**. Lo que no pudo entrar aparece en **Cobros**: tratamientos sin valor, medios de pago sin cuenta, fechas futuras o correcciones a medias. Los tratamientos a crédito quedan **por cobrar**.",
        },
        {
          tipo: "lista",
          items: [
            "`Poner al día` registra de una vez lo que ya tiene cuenta (por ejemplo, después de asignar un medio de pago).",
            "`Registrar cobro`: cuando el paciente paga un crédito, eliges la cuenta, la fecha y el valor.",
          ],
        },
        { tipo: "imagen", archivo: "finanzas-cobros.jpg", alt: "Cobros por revisar y por cobrar" },
      ],
    },
    {
      id: "bold",
      titulo: "Liquida Bold",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Los cobros con la pasarela quedan **pendientes de abono** hasta que la plata llega al banco. La pantalla **Bold** los agrupa por día esperado con el neto que debería llegar.",
        },
        {
          tipo: "pasos",
          pasos: [
            "Marca los cobros que llegaron y pulsa `Liquidar`.",
            "Elige la cuenta a la que llegó, la fecha y escribe **cuánto llegó**. Adjunta el reporte de Bold si quieres.",
            "Al confirmar se registran el abono al banco, la comisión, las retenciones (no son gasto: se descuentan en la declaración) y la diferencia si llegó otro valor.",
          ],
        },
        { tipo: "imagen", archivo: "finanzas-bold.jpg", alt: "Pendientes de Bold y liquidaciones" },
        { tipo: "nota", tono: "pro", texto: "Las tarifas y la liquidación de Bold son del plan Pro." },
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
