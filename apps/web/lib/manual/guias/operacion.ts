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
  ],
};
