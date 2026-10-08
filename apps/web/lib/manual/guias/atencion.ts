import type { Guia } from "@/lib/manual/tipos";

export const PACIENTES: Guia = {
  slug: "pacientes",
  titulo: "Pacientes",
  resumen: "Registra pacientes, completa su información obligatoria y consulta su ficha con atenciones, citas, insumos y contactos.",
  grupo: "Atención",
  icono: "users",
  ruta: "/pacientes",
  secciones: [
    {
      id: "lista",
      titulo: "La lista de pacientes",
      bloques: [
        {
          tipo: "texto",
          texto:
            "En **Atención → Pacientes** buscas por nombre o número de identificación. Cada fila tiene `Ver` (la ficha), `Editar` y `Desactivar`. La insignia **Información pendiente** avisa que al paciente le falta algo obligatorio.",
        },
        { tipo: "imagen", archivo: "pacientes.jpg", alt: "Lista de pacientes" },
      ],
    },
    {
      id: "nuevo",
      titulo: "Registra un paciente",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "Pulsa `Nuevo paciente`.",
            "Completa **Tipo y número de identificación**, **Primer nombre**, **Primer apellido**, **Correo** y **Teléfono principal** (obligatorios).",
            "Agrega lo demás que tengas: fecha de nacimiento, género, EPS, nacionalidad, dirección, contacto de emergencia y **¿Cómo nos conoció?**. Si llegó por una campaña, elígela en **Campaña**: así se mide su embudo.",
            "Pulsa `Crear paciente`.",
          ],
        },
        { tipo: "imagen", archivo: "paciente-nuevo.jpg", alt: "Formulario Nuevo paciente" },
        {
          tipo: "nota",
          tono: "aviso",
          texto:
            "Un paciente sin documento, correo o teléfono queda con **información pendiente** y no se le pueden registrar tratamientos hasta completarla en su ficha. El “paciente rápido” de la Agenda (solo nombre, apellido, correo y teléfono) queda así a propósito: completa el documento en el consultorio.",
        },
        { tipo: "nota", tono: "info", texto: "Para cargar muchos pacientes, el administrador usa `Importar` con la plantilla de Excel." },
      ],
    },
    {
      id: "ficha",
      titulo: "La ficha del paciente",
      bloques: [
        { tipo: "texto", texto: "Al pulsar `Ver` se abre la ficha con sus pestañas:" },
        {
          tipo: "lista",
          items: [
            "**Datos básicos**: toda su información y el botón `Editar paciente`.",
            "**Atenciones**: cada encuentro clínico, con o sin cita. Desde aquí puedes crear una `Atención sin cita`.",
            "**Citas**: su agenda, con las acciones de cada cita y `Nueva cita`.",
            "**Insumos**: lo que se le aplicó en cada tratamiento (insumo, lote, cantidad y sitio).",
            "**Contactos**: llamadas, WhatsApp o correos con el paciente, con su resultado y la próxima acción (`Nuevo contacto`).",
          ],
        },
        { tipo: "imagen", archivo: "paciente-ficha.jpg", alt: "Ficha del paciente" },
      ],
    },
  ],
};

export const AGENDA: Guia = {
  slug: "agenda",
  titulo: "Agenda y citas",
  resumen: "Agenda citas sin choques de horario, bloquea espacios y lleva cada cita de agendada a atendida.",
  grupo: "Atención",
  icono: "calendar",
  ruta: "/citas",
  secciones: [
    {
      id: "calendario",
      titulo: "El calendario",
      bloques: [
        {
          tipo: "texto",
          texto:
            "**Atención → Agenda** muestra las citas por **Día**, **Semana** (la vista inicial) o **Mes**, de 6:00 a 21:00. Filtra por **Sede** y **Profesional**; cada profesional tiene su color y cada estado su leyenda (Agendada, Confirmada, Atendida, No asistió, Cancelada, Reprogramada, Bloqueo).",
        },
        { tipo: "imagen", archivo: "agenda.jpg", alt: "Agenda en vista semana" },
      ],
    },
    {
      id: "nueva-cita",
      titulo: "Agenda una cita",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "Haz clic en un espacio libre del calendario (se precargan fecha y hora) o pulsa `Nueva cita`.",
            "Elige el **Paciente**. Si es nuevo, usa `Nuevo paciente` para crearlo en el momento.",
            "Elige **Tipo de tratamiento**, **Profesional**, **Sede** y **Consultorio**, y ajusta **Fecha**, **Hora inicio** y **Hora fin**.",
            "Pulsa `Agendar cita`. El paciente recibe un correo con la cita para su calendario.",
          ],
        },
        { tipo: "imagen", archivo: "cita-nueva.jpg", alt: "Formulario Nueva cita" },
        {
          tipo: "nota",
          tono: "aviso",
          texto: "Si el profesional o el consultorio ya están ocupados, EWAH te avisa. Puedes `Cambiar horario` o `Agendar de todas formas`.",
        },
      ],
    },
    {
      id: "estados",
      titulo: "Confirmar, atender, reprogramar o cancelar",
      bloques: [
        { tipo: "texto", texto: "Haz clic en una cita para ver su detalle y sus acciones:" },
        {
          tipo: "lista",
          items: [
            "`Confirmar`: la cita pasa a confirmada y el paciente recibe el aviso.",
            "`Atender`: abre (o crea) la **atención** de esa cita para registrar anamnesis, tratamientos y evolución. Luego el botón dice `Ver atención`.",
            "`No asistió`: para una cita confirmada a la que el paciente no llegó.",
            "`Reprogramar`: nueva fecha y hora; la cita original queda como “Reprogramada”.",
            "`Cancelar`: pide el motivo.",
          ],
        },
        { tipo: "imagen", archivo: "cita-detalle.jpg", alt: "Detalle de una cita con sus acciones" },
        {
          tipo: "nota",
          tono: "info",
          texto: "Cada profesional recibe hacia las 6 p. m. un correo con sus citas del día siguiente. Para vacaciones, capacitaciones o almuerzos usa `Bloquear horario`.",
        },
      ],
    },
  ],
};

export const ATENCIONES: Guia = {
  slug: "atenciones",
  titulo: "Atenciones: anamnesis, tratamientos y evolución",
  resumen: "La atención agrupa lo que pasó en un encuentro clínico: anamnesis, tratamientos, evoluciones y epicrisis.",
  grupo: "Atención",
  icono: "stethoscope",
  secciones: [
    {
      id: "que-es",
      titulo: "Qué es una atención",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Una **atención** es el encuentro clínico de un paciente en una fecha. Todo tratamiento pertenece a una atención. Se crea al pulsar `Atender` en una cita, con `Atención sin cita` (en la Agenda o en la ficha del paciente) o automáticamente al registrar un tratamiento desde Tratamientos.",
        },
        { tipo: "imagen", archivo: "atencion.jpg", alt: "Detalle de una atención" },
      ],
    },
    {
      id: "registrar",
      titulo: "Registra la atención completa",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "**Anamnesis**: pulsa `Registrar anamnesis` (una por atención). Fecha, profesional y motivo de consulta son obligatorios; agrega antecedentes, alergias, medicamentos, hábitos y examen físico (talla, peso, tipo de sangre, fototipo). Puedes `Copiar de la última anamnesis`.",
            "**Tratamientos**: pulsa `Agregar tratamiento`. Cada tratamiento tiene botones para **Insumos**, **Fotos** (antes/después), **Anexos** y **Consentimiento**.",
            "**Evolución**: pulsa `Nueva evolución` y escribe la nota; puedes vincularla al tratamiento al que hace seguimiento y fijar el próximo control.",
            "**Epicrisis**: `Epicrisis de la atención` o `Epicrisis general` para el resumen de cierre.",
          ],
        },
        { tipo: "nota", tono: "info", texto: "El total de la atención no incluye tratamientos anulados." },
      ],
    },
  ],
};

export const TRATAMIENTOS: Guia = {
  slug: "tratamientos",
  titulo: "Tratamientos",
  resumen: "Registra procedimientos con su valor y medio de pago, insumos aplicados, fotos y consentimiento. Se corrigen anulando.",
  grupo: "Atención",
  icono: "clipboard",
  ruta: "/tratamientos",
  secciones: [
    {
      id: "historial",
      titulo: "El historial de tratamientos",
      bloques: [
        {
          tipo: "texto",
          texto:
            "**Atención → Tratamientos** lista lo registrado con filtros por profesional, sede, paciente, tipo de tratamiento y fechas. Un registro guardado **no se edita**: se anula con motivo y se corrige con uno nuevo, así queda la trazabilidad.",
        },
        { tipo: "imagen", archivo: "tratamientos.jpg", alt: "Historial de tratamientos" },
      ],
    },
    {
      id: "registrar",
      titulo: "Registra un tratamiento",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "Pulsa `Nuevo tratamiento` (o `Agregar tratamiento` dentro de una atención).",
            "Elige **Paciente**, **Tipo de tratamiento**, **Profesional**, **Fecha** y **Sede**.",
            "Elige el **Medio de pago** y escribe el **Valor**. Si facturaste electrónicamente, agrega el **CUFE**.",
            "Pulsa `Registrar tratamiento`.",
          ],
        },
        { tipo: "imagen", archivo: "tratamiento-nuevo.jpg", alt: "Formulario Nuevo tratamiento" },
        {
          tipo: "nota",
          tono: "info",
          texto: "Si tienes el **Flujo de caja** activado, el tratamiento genera solo su ingreso en la cuenta de su medio de pago. Ver la guía “Cobros e ingresos de tratamientos”.",
        },
      ],
    },
    {
      id: "insumos-fotos",
      titulo: "Insumos, fotos, anexos y consentimiento",
      bloques: [
        {
          tipo: "lista",
          items: [
            "**Insumos**: elige el insumo y su lote (o escanea el código QR), la cantidad usada y el sitio anatómico, y pulsa `Registrar consumo`. Descuenta el stock del lote.",
            "**Fotos**: registra el par antes/después del tratamiento.",
            "**Consentimiento**: toma fotos de cada página con la cámara (se guardan como un PDF) o sube el archivo firmado.",
            "**Anexos** (plan Pro): exámenes, ecografías o radiografías del paciente.",
          ],
        },
        { tipo: "imagen", archivo: "tratamiento-insumos.jpg", alt: "Insumos usados en un tratamiento" },
      ],
    },
    {
      id: "anular",
      titulo: "Anular, corregir y editar",
      bloques: [
        {
          tipo: "lista",
          items: [
            "`Anular`: pide el motivo; el registro no se borra, queda marcado como anulado.",
            "`Corregir`: sobre un anulado, crea el tratamiento correcto que lo reemplaza.",
            "`Editar`: atajo que anula y corrige en un paso (requiere permisos de crear y anular).",
            "Revertir una anulación es exclusivo del administrador.",
          ],
        },
      ],
    },
  ],
};
