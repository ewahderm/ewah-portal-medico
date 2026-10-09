import type { Guia } from "@/lib/manual/tipos";

export const CREAR_CLINICA: Guia = {
  slug: "crear-tu-clinica",
  titulo: "Crea tu clínica y entra por primera vez",
  resumen: "Registro de la clínica o del consultorio, confirmación del correo, inicio de sesión y la lista de primeros pasos.",
  grupo: "Primeros pasos",
  icono: "rocket",
  secciones: [
    {
      id: "registro",
      titulo: "Registra tu clínica",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Cada clínica (o consultorio independiente) tiene su propia cuenta en EWAH. Quien la registra queda como **Administrador**: tiene acceso a todo y luego invita al resto del equipo.",
        },
        {
          tipo: "pasos",
          pasos: [
            "Entra a la página de registro desde **¿Todavía no tienes cuenta? Regístrate** en la pantalla de inicio de sesión.",
            "En **Tipo de cuenta** elige `Clínica` o `Consultorio independiente` (solo cambia los textos; las dos funcionan igual).",
            "Escribe el **Nombre de la clínica**, el **NIT**, **Tu nombre**, **Tu correo** y una **Contraseña** de al menos 8 caracteres.",
            "Pulsa `Crear clínica`. Te llevamos a una pantalla que dice **Revisa tu correo**.",
            "Abre el correo de confirmación y pulsa el enlace. Tu cuenta queda activa y entras al **Dashboard**.",
          ],
        },
        { tipo: "imagen", archivo: "registro.jpg", alt: "Formulario Crea tu cuenta", pie: "Registro de una clínica nueva." },
        {
          tipo: "nota",
          tono: "info",
          texto:
            "Tu clínica empieza en el plan **Gratis** (hasta 30 pacientes activos). Puedes pedir el plan Pro cuando quieras desde **Administración → Suscripción**.",
        },
        { tipo: "nota", tono: "aviso", texto: "Si el NIT ya está registrado verás “Ya existe una clínica registrada con ese NIT”. Pide acceso al administrador de esa clínica." },
      ],
    },
    {
      id: "iniciar-sesion",
      titulo: "Inicia sesión y recupera tu contraseña",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "Escribe tu **Correo electrónico** y tu **Contraseña** y pulsa `Iniciar sesión`.",
            "Si la olvidaste, pulsa **¿Olvidaste tu contraseña?**, escribe tu correo y pulsa `Enviar enlace de recuperación`.",
            "El enlace del correo te lleva a **Elige tu contraseña**: escribe una nueva (mínimo 8 caracteres) y pulsa `Guardar contraseña`.",
          ],
        },
        { tipo: "imagen", archivo: "login.jpg", alt: "Pantalla de inicio de sesión" },
        { tipo: "nota", tono: "aviso", texto: "Después de 5 intentos fallidos la cuenta se bloquea por seguridad. Recupera la contraseña o pide al administrador que la restablezca." },
      ],
    },
    {
      id: "dashboard",
      titulo: "El Dashboard y el asistente de configuración",
      bloques: [
        {
          tipo: "texto",
          texto:
            "Al entrar ves el **Dashboard**: tu cuenta y los módulos que puedes usar. Si eres administrador y a tu clínica le falta algo por configurar, arriba aparece la tarjeta **Configura tu clínica** con lo que falta.",
        },
        {
          tipo: "texto",
          texto:
            "**El asistente de configuración** te lleva módulo por módulo (tu clínica, pacientes, tratamientos, agenda y los demás que tengas activos) y en cada uno te dice tres cosas: **qué es** cada dato, **qué deja de funcionar si no lo configuras** y un botón que te lleva directo a la pantalla donde se configura.",
        },
        {
          tipo: "pasos",
          pasos: [
            "Ábrelo desde la tarjeta **Configura tu clínica** del Dashboard o desde **Administración → Configurar clínica**.",
            "Pulsa `Empezar paso a paso`. Verás el primer módulo con sus puntos: los **Esenciales** (sin ellos algo no funciona) y los **Recomendados** (todo funciona, pero queda incompleto).",
            "Pulsa el botón de cada punto pendiente (por ejemplo `Crear sede`). Te lleva a la pantalla exacta. Cuando termines, usa el botón flotante **Volver al asistente de configuración** (abajo a la izquierda) para seguir donde ibas.",
            "Pulsa `Siguiente` para pasar al siguiente módulo, o `Omitir por ahora` si quieres dejarlo para después.",
            "Al terminar, o cuando quieras, pulsa `Ver toda la lista`: muestra cada módulo con su estado (*Completo*, *Faltan N* o *Sugerencias*) y lo que falta.",
          ],
        },
        {
          tipo: "nota",
          tono: "info",
          texto:
            "Omitir no borra nada: lo pendiente sigue en la lista con su aviso de qué afecta, para que lo completes cuando puedas. La lista se actualiza sola a medida que configuras.",
        },
        { tipo: "imagen", archivo: "dashboard.jpg", alt: "Dashboard con los módulos", pie: "Cada tarjeta abre un módulo. La insignia **Pro** indica que tu plan aún no lo incluye." },
        {
          tipo: "texto",
          texto:
            "El menú de arriba agrupa los módulos: **Atención** (Agenda, Pacientes, Tratamientos), **Operación** (Inventario, Flujo de caja, Recursos Humanos), **Relación** (Campañas), **Cumplimiento** (Medio Ambiente, Habilitación, SG-SST) y **Administración** (Usuarios, Parámetros, Suscripción). Solo ves lo que tu rol tiene permitido.",
        },
      ],
    },
  ],
};

export const CONFIGURACION: Guia = {
  slug: "configuracion-inicial",
  titulo: "Configura la clínica: Parámetros",
  resumen: "Datos básicos, sedes, consultorios, tipos de tratamiento, CUPS, medios de pago, insumos y demás catálogos.",
  grupo: "Primeros pasos",
  icono: "settings",
  ruta: "/parametros",
  secciones: [
    {
      id: "que-es",
      titulo: "Qué son los Parámetros",
      bloques: [
        {
          tipo: "texto",
          texto:
            "**Parámetros** reúne los catálogos que alimentan las listas desplegables de toda la aplicación. Se organiza en pestañas por tema (Generales, Pacientes, Tratamientos, Inventario, Campañas, Medio Ambiente, Recursos Humanos) y cada una tiene sub-pestañas.",
        },
        {
          tipo: "nota",
          tono: "info",
          texto: "Los catálogos con la insignia **Administrado por EWAH Tech** (países, EPS, CUPS, bancos, etc.) los mantiene EWAH y se ven en modo lectura.",
        },
        { tipo: "imagen", archivo: "parametros.jpg", alt: "Parámetros, pestaña Generales" },
      ],
    },
    {
      id: "datos-basicos",
      titulo: "Datos básicos de la clínica",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "En **Parámetros**, pulsa `Datos básicos de la clínica` (arriba a la derecha; solo administradores).",
            "Completa nombre legal y comercial, **actividad económica (RUT)**, tipo y número de documento, dirección, teléfono, correo, país, departamento y ciudad.",
            "Si ya estás habilitado, escribe el **código de habilitación del prestador (REPS)** de 12 dígitos y agrega tus **servicios habilitados** (sede → grupo → servicio → código).",
            "En **Nómina**, elige el nivel de riesgo ARL por defecto y si tu clínica está exonerada de aportes (Ley 1607 de 2012).",
            "Pulsa `Guardar`.",
          ],
        },
        { tipo: "imagen", archivo: "parametros-datos-basicos.jpg", alt: "Diálogo Datos básicos de la clínica" },
      ],
    },
    {
      id: "sedes-consultorios",
      titulo: "Sedes y consultorios",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "En **Generales → Sedes** pulsa `Agregar valor`, escribe el nombre de la sede y pulsa `Agregar`.",
            "En **Generales → Consultorios** pulsa `Agregar consultorio`, escribe el nombre y elige su **Sede**.",
            "Para dejar de usar un valor sin borrar su historia, cambia el interruptor de la fila a **Inactivo**.",
          ],
        },
        { tipo: "nota", tono: "info", texto: "Los consultorios se usan en la Agenda para evitar que dos citas ocupen el mismo espacio a la misma hora." },
      ],
    },
    {
      id: "tratamientos-pagos",
      titulo: "Tipos de tratamiento, CUPS y medios de pago",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "En **Tratamientos → CUPS** busca por código o descripción y activa los procedimientos que realizas.",
            "En **Tratamientos → Tipos de tratamiento** pulsa `Agregar tipo de tratamiento`: nombre (por ejemplo “Botox”) y, si aplica, el **servicio habilitado** y el **CUPS**.",
            "En **Tratamientos → Medios de pago** agrega cómo te pagan: efectivo, tarjeta, transferencia, crédito…",
          ],
        },
        { tipo: "imagen", archivo: "parametros-tratamientos.jpg", alt: "Tipos de tratamiento en Parámetros" },
        {
          tipo: "nota",
          tono: "info",
          texto: "A qué cuenta del flujo de caja llega cada medio de pago (y su tarifa, por ejemplo la de Bold) se configura en **Flujo de caja → Configuración → Medios de pago**.",
        },
      ],
    },
    {
      id: "otros-catalogos",
      titulo: "Inventario, medio ambiente y recursos humanos",
      bloques: [
        {
          tipo: "lista",
          items: [
            "**Inventario → Insumos**: nombre, unidad de medida, proveedor y registro INVIMA de cada insumo. También **Proveedores** y **Motivos de movimiento** (entradas y salidas de stock).",
            "**Medio Ambiente → Neveras** (para la cadena de frío) y **Tipos de extintor**.",
            "**Recursos Humanos → Cargos** (con su clase de riesgo) y **Tipos de vacuna**.",
          ],
        },
        {
          tipo: "nota",
          tono: "info",
          texto: "Los catálogos simples tienen el botón `Importar`: descarga la plantilla de Excel, llénala (una fila por valor) y súbela para cargar muchos valores de una vez.",
        },
      ],
    },
  ],
};

export const USUARIOS: Guia = {
  slug: "usuarios-y-permisos",
  titulo: "Usuarios, roles y permisos",
  resumen: "Invita a tu equipo, crea roles y decide qué puede ver y hacer cada uno.",
  grupo: "Primeros pasos",
  icono: "user-cog",
  ruta: "/usuarios",
  secciones: [
    {
      id: "usuarios",
      titulo: "Agrega usuarios",
      bloques: [
        { tipo: "texto", texto: "Solo el **Administrador** entra a **Administración → Usuarios**. Allí ve a todo el equipo con su rol y estado (Activo, Bloqueado o Desactivado)." },
        {
          tipo: "pasos",
          pasos: [
            "Pulsa `Agregar usuario`.",
            "Elige **Con contraseña** (le das una contraseña temporal) o **Invitar por correo** (le llega un enlace para crear la suya).",
            "Escribe **Nombre**, **Correo** y elige su **Rol**.",
            "Pulsa `Crear usuario` o `Enviar invitación`.",
          ],
        },
        { tipo: "imagen", archivo: "usuarios.jpg", alt: "Usuarios y roles" },
        { tipo: "nota", tono: "info", texto: "Si alguien olvidó su contraseña o quedó bloqueado, usa `Restablecer contraseña` en su fila." },
      ],
    },
    {
      id: "roles",
      titulo: "Roles y matriz de permisos",
      bloques: [
        {
          tipo: "pasos",
          pasos: [
            "En la tarjeta **Roles**, pulsa `Crear rol` y escribe un nombre (por ejemplo “Recepción” o “Médico”).",
            "Pulsa `Editar permisos` en ese rol.",
            "Para cada módulo marca **Activar** (ver) y, si corresponde, **Crear**, **Editar**, **Eliminar**, **Aprobar** y **Anular**. Cada casilla se guarda al instante.",
          ],
        },
        { tipo: "imagen", archivo: "usuarios-permisos.jpg", alt: "Matriz de permisos de un rol" },
        {
          tipo: "nota",
          tono: "aviso",
          texto: "El rol **Administrador** tiene acceso total y no se edita. Exportar e importar datos es exclusivo del administrador.",
        },
      ],
    },
  ],
};
