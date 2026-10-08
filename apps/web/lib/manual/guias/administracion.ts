import type { Guia } from "@/lib/manual/tipos";

export const SUSCRIPCION: Guia = {
  slug: "suscripcion-y-datos",
  titulo: "Suscripción, marca y exportar datos",
  resumen: "Tu plan y lo que incluye, el logo y los datos de notificación, y la exportación de toda la información a Excel.",
  grupo: "Administración",
  icono: "download",
  ruta: "/suscripcion",
  secciones: [
    {
      id: "plan",
      titulo: "Tu plan",
      bloques: [
        {
          tipo: "texto",
          texto:
            "En **Administración → Suscripción** ves tu plan actual, cuántos pacientes activos llevas (el plan Gratis permite 30) y la comparación de planes con lo que incluye cada uno. Para cambiar, pulsa `Solicitar este plan` y EWAH te contacta.",
        },
        { tipo: "imagen", archivo: "suscripcion.jpg", alt: "Suscripción y planes" },
        {
          tipo: "lista",
          items: [
            "**En todos los planes**: Pacientes, Agenda, Tratamientos, Reportes, Medio Ambiente, Recursos Humanos, Usuarios y Parámetros, y lo básico de Habilitación, SG-SST y Flujo de caja.",
            "**Plan Pro**: pacientes sin límite, Inventario, Campañas, anexos en tratamientos y la gestión completa de Habilitación, SG-SST y Flujo de caja (Bold, socios, informe NIIF, cierre y alertas).",
          ],
        },
      ],
    },
    {
      id: "marca",
      titulo: "Logo y notificaciones",
      bloques: [
        {
          tipo: "texto",
          texto:
            "En la tarjeta **Marca y notificaciones**, el administrador pulsa `Editar` para subir el logo (reemplaza el de EWAH en el menú) y fijar el correo de notificaciones y el teléfono de contacto que ven tus pacientes en los correos de citas.",
        },
      ],
    },
    {
      id: "exportar",
      titulo: "Exporta tus datos",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "En **Administración → Exportar datos** (solo administradores) marca qué incluir: pacientes, tratamientos, agenda, inventario, usuarios, campañas, medio ambiente y catálogos.",
            "Pulsa `Exportar seleccionados` o `Exportar todo`: descargas un Excel con una hoja por tabla.",
          ],
        },
        { tipo: "imagen", archivo: "exportar.jpg", alt: "Exportar datos" },
        { tipo: "nota", tono: "info", texto: "Varias pantallas tienen además su propio botón `Exportar` que respeta los filtros aplicados." },
      ],
    },
  ],
};
