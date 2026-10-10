import type { Guia } from "@/lib/manual/tipos";

export const INVENTARIO: Guia = {
  slug: "inventario",
  titulo: "Inventario de insumos",
  resumen: "Recibe lotes, controla vencimientos y stock por sede, ajusta, traslada y consulta movimientos y cortes.",
  grupo: "Operación",
  icono: "package",
  ruta: "/inventario",
  secciones: [
    {
      id: "actual",
      titulo: "Inventario actual",
      bloques: [
        { tipo: "nota", tono: "pro", texto: "El control de stock y costeo es del plan Pro. El registro de insumos aplicados en Tratamientos funciona en todos los planes." },
        {
          tipo: "texto",
          texto:
            "La pestaña **Inventario actual** muestra los lotes activos, los que vencen en 30 días o menos y el valor estimado en stock. Filtra por sede, imprime etiquetas con código QR y, en cada lote, usa `Ajustar` (pérdidas o sobrantes, con motivo) o el traslado entre sedes.",
        },
        { tipo: "imagen", archivo: "inventario.jpg", alt: "Inventario actual" },
      ],
    },
    {
      id: "recepcion",
      titulo: "Recibe un lote",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "Crea primero el insumo en **Parámetros → Inventario → Insumos**.",
            "En la pestaña **Recepción de lotes** elige **Insumo** y **Sede**, escribe el **Número de lote**, la **Fecha de vencimiento**, la **Cantidad recibida**, el **Motivo del ingreso** (compra, obsequio, saldo inicial) y el **Costo unitario**.",
            "Pulsa `Registrar lote`: se crea el lote con su entrada de stock.",
          ],
        },
        { tipo: "imagen", archivo: "inventario-recepcion.jpg", alt: "Recepción de un lote" },
      ],
    },
    {
      id: "movimientos",
      titulo: "Movimientos, cortes y escaneo",
      bloques: [
        {
          tipo: "lista",
          items: [
            "**Movimientos**: todas las entradas, salidas, ajustes, consumos en tratamientos y traslados, con filtros. `Nuevo movimiento` registra una entrada o salida manual.",
            "**Cortes mensuales**: calcula ingresos, egresos y saldo de cada insumo a una fecha de corte.",
            "`Escanear`: lee el QR de la etiqueta de un lote para registrar un movimiento desde el celular.",
          ],
        },
        { tipo: "imagen", archivo: "inventario-movimientos.jpg", alt: "Movimientos de inventario" },
      ],
    },
  ],
};

export const RRHH: Guia = {
  slug: "recursos-humanos",
  titulo: "Recursos Humanos y nómina",
  resumen: "Empleados con sus documentos e historial, incapacidades, vacaciones, accidentes laborales, nómina y honorarios.",
  grupo: "Operación",
  icono: "briefcase",
  ruta: "/rrhh",
  secciones: [
    {
      id: "empleados",
      titulo: "Empleados",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "En **Operación → Recursos Humanos**, pestaña **Empleados**, pulsa `+ Nuevo empleado`.",
            "Completa nombre, identificación, contacto, **tipo de contrato** (laboral o prestación de servicios), fechas de contrato, EPS, pensión, cesantías, ARL y datos bancarios. Puedes vincularlo a un usuario de EWAH.",
            "Pulsa `Crear empleado` y luego ábrelo para gestionar su ficha.",
          ],
        },
        { tipo: "imagen", archivo: "rrhh.jpg", alt: "Lista de empleados" },
        { tipo: "nota", tono: "info", texto: "Un contrato de prestación de servicios no genera nómina, vacaciones ni cesantías: se maneja con comprobantes de honorarios." },
      ],
    },
    {
      id: "ficha",
      titulo: "La ficha del empleado",
      bloques: [
        {
          tipo: "lista",
          items: [
            "**Documentos**: identidad, tarjeta profesional, contrato, vacunas, exámenes ocupacionales… con fecha de caducidad.",
            "**Historial**: cambios de cargo y de salario con su acta.",
            "**Incapacidades** y **Vacaciones**.",
            "**Nómina**: `Generar comprobante de nómina` (quincenal o mensual) → `Calcular` → revisar → `Guardar como borrador` → `Aprobar` → PDF. También la liquidación de prestaciones.",
            "**Honorarios** (prestación de servicios): valor bruto, retención y soporte de seguridad social.",
          ],
        },
        { tipo: "imagen", archivo: "rrhh-empleado.jpg", alt: "Ficha de un empleado" },
        {
          tipo: "nota",
          tono: "info",
          texto: "Las pestañas **Accidentes laborales**, **Protocolos** y **Nómina** (planilla PILA y comprobantes de toda la clínica) completan el módulo. Los administradores reciben alertas por correo de vacunas y contratos por vencer.",
        },
      ],
    },
    {
      id: "solicitudes-empleado",
      titulo: "Pedir vacaciones o permisos (para el empleado)",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Si tienes usuario en EWAH y tu ficha de empleado está vinculada a él, en el menú aparece **Mis solicitudes**. No necesitas acceso al módulo de Recursos Humanos.",
        },
        {
          tipo: "lista",
          items: [
            "Arriba ves **cuántos días de vacaciones tienes disponibles** (se acumulan 15 días hábiles por año trabajado) y **cuántas horas te faltan por reponer**.",
            "`Nueva solicitud` → elige **Vacaciones** (desde y hasta; EWAH te dice cuántos días hábiles son), **Permiso por horas** (el día, desde qué hora hasta qué hora y el motivo) o **Reposición de horas** (las horas que trabajaste de más para reponer un permiso).",
            "Puedes pedir **más días de vacaciones de los que tienes acumulados**: la solicitud se envía igual y quien aprueba lo ve marcado.",
            "La solicitud queda **Pendiente** hasta que el administrador o Recursos Humanos la apruebe o la rechace. Te llega un correo con la respuesta. Mientras esté pendiente puedes `Cancelar solicitud`.",
          ],
        },
        {
          tipo: "nota",
          tono: "info",
          texto:
            "Si no ves **Mis solicitudes**, tu usuario no está vinculado a tu ficha: pídele a Recursos Humanos que en tu ficha de empleado elija tu usuario en **Vincular a un usuario existente**.",
        },
      ],
    },
    {
      id: "solicitudes-aprobar",
      titulo: "Aprobar solicitudes (para el administrador o Recursos Humanos)",
      bloques: [
        {
          tipo: "texto",
          texto:
            "En **Recursos Humanos → Solicitudes** está la bandeja **Por aprobar** (el número también aparece en el menú) y las resueltas recientemente. Cada vez que llega una solicitud, quienes aprueban reciben un correo.",
        },
        {
          tipo: "pasos",
          pasos: [
            "Pulsa `Aprobar` o `Rechazar`. Para rechazar escribe el motivo: le llega al empleado.",
            "En un **permiso por horas**, al aprobar eliges cómo queda: **Se repone** (el empleado debe reponer esas horas), **Remunerado, no se repone** (por ejemplo una cita médica o una calamidad) o **No remunerado** (no se repone, pero se descuenta del pago).",
            "Al aprobar unas **vacaciones**, quedan registradas en la ficha del empleado y descuentan de su saldo. Si pidió más días de los acumulados, la solicitud lo muestra con la marca *Excede el saldo*; tú decides.",
            "Las **reposiciones** que apruebes descuentan de las horas que el empleado debe reponer.",
          ],
        },
        {
          tipo: "lista",
          items: [
            "**Quién aprueba:** el Administrador siempre. Para que otra persona (por ejemplo un *Gerente de Recursos Humanos*) apruebe, crea ese rol en **Usuarios** y márcale **Aprobar** en Recursos Humanos. Nadie aprueba su propia solicitud, salvo el Administrador.",
            "**Empleados sin usuario:** `Registrar solicitud` y eliges el empleado. Necesitas el permiso **Crear** en Recursos Humanos.",
            "**Días hábiles:** domingos y festivos nunca cuentan. Al final de la pestaña defines si **el sábado es día laboral** en tu clínica.",
          ],
        },
      ],
    },
  ],
};
