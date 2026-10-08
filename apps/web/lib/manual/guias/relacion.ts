import type { Guia } from "@/lib/manual/tipos";

export const CAMPANAS: Guia = {
  slug: "campanas",
  titulo: "Campañas de captación",
  resumen: "Crea campañas y mide su embudo: leads, contactados, citas, pacientes convertidos e ingresos.",
  grupo: "Relación y reportes",
  icono: "megaphone",
  ruta: "/campanas",
  secciones: [
    {
      id: "crear",
      titulo: "Crea una campaña",
      bloques: [
        { tipo: "nota", tono: "pro", texto: "Campañas es del plan Pro." },
        {
          tipo: "pasos",
          pasos: [
            "En **Relación → Campañas** pulsa `Nueva campaña`.",
            "Escribe el **Nombre** (por ejemplo “Promo Botox marzo — Instagram”) y, si quieres, el canal, las fechas, el presupuesto y el objetivo.",
            "Pulsa `Crear campaña`.",
          ],
        },
      ],
    },
    {
      id: "embudo",
      titulo: "El embudo",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Un paciente entra al embudo cuando al crearlo eliges la campaña en **Campaña (opcional)**. Avanza solo: **Contactados** cuando registras un contacto en su ficha, **Agendaron cita** cuando tiene una cita y **Convertidos** cuando tiene un tratamiento; **Ingresos** suma el valor de esos tratamientos.",
        },
        { tipo: "imagen", archivo: "campanas.jpg", alt: "Campañas con su embudo" },
      ],
    },
  ],
};

export const REPORTES: Guia = {
  slug: "reportes",
  titulo: "Reportes",
  resumen: "Actividad clínica por periodo, tratamiento, profesional, medio de pago y país; reporte INVIMA y comisiones.",
  grupo: "Relación y reportes",
  icono: "chart",
  ruta: "/reportes",
  secciones: [
    {
      id: "actividad",
      titulo: "Actividad clínica",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Elige el periodo (**Desde** / **Hasta**) y pulsa `Actualizar`. Verás los tratamientos registrados y su valor (sin anulados), la tendencia mensual, el mapa por país de residencia y los rankings de tratamientos, profesionales y medios de pago.",
        },
        { tipo: "imagen", archivo: "reportes.jpg", alt: "Reportes de actividad clínica" },
      ],
    },
    {
      id: "otros",
      titulo: "INVIMA y comisiones",
      bloques: [
        {
          tipo: "lista",
          items: [
            "**INVIMA** (plan Pro, con acceso a Inventario): los productos con registro sanitario para el reporte, descargable en Excel.",
            "**Comisiones de nómina**: comisiones registradas por empleado en un rango de fechas.",
          ],
        },
        { tipo: "nota", tono: "info", texto: "Cada pestaña pide el permiso del módulo de donde salen los datos (Tratamientos y Pacientes, Inventario o Recursos Humanos)." },
      ],
    },
  ],
};
