import type { Guia } from "@/lib/manual/tipos";

export const MEDIO_AMBIENTE: Guia = {
  slug: "medio-ambiente",
  titulo: "Medio Ambiente",
  resumen: "Temperatura y humedad, cadena de frío de neveras, residuos y reporte PGIRASA, extintores y limpieza.",
  grupo: "Cumplimiento",
  icono: "leaf",
  ruta: "/medio-ambiente",
  secciones: [
    {
      id: "registros",
      titulo: "Registros diarios",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Cada pestaña es una bitácora con filtros por sede y fechas y el botón `+ Nuevo registro`. Los registros no se editan ni se borran: son evidencia para auditorías y visitas.",
        },
        {
          tipo: "lista",
          items: [
            "**Temperatura y Humedad** de cada consultorio, en jornada AM o PM.",
            "**Neveras**: temperatura de la cadena de frío (las neveras se crean en Parámetros).",
            "**Residuos**: peso por tipo de caneca (biosanitario, cortopunzante, aprovechable…) y quién lo pesó.",
            "**Limpieza** de consultorios y baños, con el empleado que la hizo.",
          ],
        },
        { tipo: "imagen", archivo: "medio-ambiente.jpg", alt: "Registros de temperatura de neveras" },
      ],
    },
    {
      id: "pgirasa-extintores",
      titulo: "Reporte PGIRASA y extintores",
      bloques: [
        {
          tipo: "lista",
          items: [
            "**Reporte PGIRASA**: elige sede y mes y pulsa `Calcular reporte` (promedio de 6 meses, Res. 0591 de 2024). Si un mes no tuvo residuos peligrosos, confírmalo con `Confirmar 0 kg peligrosos`.",
            "**Extintores**: tipo, ubicación, serie, última recarga y vencimiento. Los vencidos se marcan en rojo.",
          ],
        },
        { tipo: "imagen", archivo: "medio-ambiente-residuos.jpg", alt: "Registro de residuos" },
      ],
    },
  ],
};

export const HABILITACION: Guia = {
  slug: "habilitacion",
  titulo: "Habilitación (REPS y Resolución 3100)",
  resumen: "Tu ruta de habilitación: perfil del prestador, sedes y servicios, documentos, autoevaluación y calendario regulatorio.",
  grupo: "Cumplimiento",
  icono: "shield-check",
  ruta: "/habilitacion",
  secciones: [
    {
      id: "ruta",
      titulo: "Tu ruta de habilitación",
      bloques: [
        {
          tipo: "texto",
          texto:
            "El **Resumen** te pregunta si ya estás inscrito en el REPS y te guía en 6 pasos: perfil del prestador → sedes y servicios → documentos de inscripción → autoevaluación → obligaciones y calendario → tablero. La tarjeta **Lo urgente** muestra lo que vence primero.",
        },
        { tipo: "imagen", archivo: "habilitacion.jpg", alt: "Resumen de Habilitación" },
        { tipo: "nota", tono: "pro", texto: "Sedes y servicios, Documentos y Autoevaluación son del plan Pro. Perfil, Calendario y Obligaciones están en todos los planes." },
      ],
    },
    {
      id: "autoevaluacion",
      titulo: "Autoevaluación de estándares",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "En **Autoevaluación** filtra los criterios por estado, servicio o texto.",
            "Marca cada criterio: `Cumple` (con evidencia: archivo, nota o enlace), `No aplica` (con justificación) o `No cumple` (abre un **plan de mejora** con responsable y fecha).",
            "Cuando termines, `Cerrar autoevaluación`: queda en el historial con su fecha de declaración.",
          ],
        },
        { tipo: "imagen", archivo: "habilitacion-autoevaluacion.jpg", alt: "Criterios de la autoevaluación" },
      ],
    },
    {
      id: "calendario",
      titulo: "Calendario y obligaciones",
      bloques: [
        {
          tipo: "texto",
          texto:
            "El **Calendario** muestra reportes, planes de mejora y documentos por vencer con semáforo (rojo: vencido o en 7 días; ámbar: 8 a 30 días; verde: más de 30). Al presentar una obligación registra la fecha, el radicado y el acuse. En **Obligaciones** activas las que te aplican y configuras los avisos por correo.",
        },
      ],
    },
  ],
};

export const SST: Guia = {
  slug: "sg-sst",
  titulo: "SG-SST",
  resumen: "Diagnóstico, incidentes y accidentes, documentos, matriz de peligros, capacitación y EPP, plan anual, comités y estándares mínimos.",
  grupo: "Cumplimiento",
  icono: "hard-hat",
  ruta: "/sst",
  secciones: [
    {
      id: "diagnostico",
      titulo: "Diagnóstico",
      bloques: [
        {
          tipo: "texto",
          texto:
            "El **Diagnóstico** te dice qué te exige la norma (Decreto 1072 de 2015 y Resolución 0312 de 2019) según tus datos —cómo trabajas, cuántos trabajadores tienes y quién es el responsable del SG-SST— y lista tus pendientes.",
        },
        { tipo: "imagen", archivo: "sst.jpg", alt: "Diagnóstico del SG-SST" },
      ],
    },
    {
      id: "eventos",
      titulo: "Incidentes y accidentes",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "Pulsa `+ Reportar un evento` y elige incidente, accidente de trabajo o enfermedad laboral.",
            "Completa persona, fecha, hora, sede, lugar, qué pasó, gravedad y lesión.",
            "En el detalle registra el reporte (FURAT, radicado, días de incapacidad), la **investigación** (causas inmediatas y básicas) y el **plan de acción**.",
          ],
        },
        { tipo: "imagen", archivo: "sst-eventos.jpg", alt: "Incidentes y accidentes" },
        { tipo: "nota", tono: "aviso", texto: "El reporte de un accidente vence a los 2 días hábiles y la investigación a los 15 días: EWAH te avisa por correo." },
      ],
    },
    {
      id: "gestion",
      titulo: "Gestión del sistema",
      bloques: [
        { tipo: "nota", tono: "pro", texto: "Documentos, Peligros, Capacitación y EPP, Plan y comités y Estándares son del plan Pro." },
        {
          tipo: "lista",
          items: [
            "**Documentos**: política, reglamento y demás, con versiones.",
            "**Peligros**: matriz GTC 45 con plantillas del sector salud.",
            "**Capacitación y EPP**: exámenes por cargo, vacunas, capacitaciones con asistencia y entregas de EPP.",
            "**Plan y comités**: plan anual de trabajo, comités con sus reuniones y los indicadores de frecuencia, severidad y ausentismo.",
            "**Estándares**: autoevaluación de estándares mínimos del año, que se cierra cuando no queda nada pendiente.",
          ],
        },
      ],
    },
  ],
};
