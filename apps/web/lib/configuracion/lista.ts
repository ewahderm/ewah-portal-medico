// Asistente de configuración de la clínica: qué hace falta, módulo por
// módulo, y qué deja de funcionar si no se completa. Puro (sin red): recibe
// los conteos que lee estado.ts y arma la lista. Los textos están escritos
// para alguien que no es experto en sistemas ni en finanzas.

// Obligatorio: sin él algo del módulo no funciona. Recomendado: funciona,
// pero queda incompleto.
export type TipoPunto = "obligatorio" | "recomendado";
export type EstadoPunto = "listo" | "pendiente";

export type Punto = {
  id: string;
  titulo: string;
  // Qué es, en una frase.
  queEs: string;
  // Qué pasa si no se completa (o qué ganas al completarlo, si es recomendado).
  impacto: string;
  tipo: TipoPunto;
  estado: EstadoPunto;
  // Lo que hay hoy, por ejemplo "2 sedes".
  detalle?: string;
  href: string;
  accion: string;
};

export type ModuloConfiguracion = {
  codigo: string;
  titulo: string;
  paraQue: string;
  puntos: Punto[];
};

export type Hechos = {
  clinica: {
    nit: string | null;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    ciudadId: string | null;
    nombreComercial: string | null;
    logo: string | null;
    correoNotificaciones: string | null;
  };
  sedes: number;
  consultorios: number;
  usuariosActivos: number;
  pacientes: number;
  tiposTratamiento: number;
  tiposSinCups: number;
  tiposSinServicio: number;
  mediosPago: number;
  serviciosHabilitados: number;
  // Solo se leen si el módulo está activo; null = no aplica.
  insumos: number | null;
  proveedores: number | null;
  neveras: number | null;
  cargos: number | null;
  empleados: number | null;
  valoresLegalesAnio: boolean | null;
  finanzas: { activado: boolean; mediosSinDestino: number; pasarelasSinTarifa: number } | null;
  habilitacionPerfil: boolean | null;
  sstPerfil: { existe: boolean; responsable: boolean } | null;
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const obligatorio = (listo: boolean) => ({ tipo: "obligatorio" as const, estado: (listo ? "listo" : "pendiente") as EstadoPunto });
const recomendado = (listo: boolean) => ({ tipo: "recomendado" as const, estado: (listo ? "listo" : "pendiente") as EstadoPunto });

const PARAMETROS = (grupo: string, catalogo?: string) =>
  `/parametros?grupo=${grupo}${catalogo ? `&catalogo=${catalogo}` : ""}`;

export function armarConfiguracion(h: Hechos, activos: Set<string>): ModuloConfiguracion[] {
  const c = h.clinica;
  const datosBasicos = Boolean(c.nit && c.direccion && c.telefono && c.email && c.ciudadId);
  const modulos: ModuloConfiguracion[] = [];

  modulos.push({
    codigo: "clinica",
    titulo: "Tu clínica",
    paraQue: "Los datos que identifican a tu clínica y los lugares donde atiendes. Todo lo demás se apoya en esto.",
    puntos: [
      {
        id: "datos-basicos",
        titulo: "Datos básicos de la clínica",
        queEs: "NIT, dirección, teléfono, correo y ciudad.",
        impacto:
          "Aparecen en los documentos, los correos a pacientes y los reportes oficiales. Si faltan, esos documentos salen incompletos y los reportes a entidades pueden ser rechazados.",
        ...obligatorio(datosBasicos),
        href: "/parametros?abrir=datos-basicos",
        accion: "Completar datos",
      },
      {
        id: "sedes",
        titulo: "Sedes",
        queEs: "Cada lugar físico donde atiende la clínica.",
        impacto: "Sin una sede no se pueden agendar citas, registrar tratamientos ni manejar inventario.",
        ...obligatorio(h.sedes > 0),
        detalle: h.sedes > 0 ? plural(h.sedes, "sede", "sedes") : undefined,
        href: PARAMETROS("general", "sedes"),
        accion: "Crear sede",
      },
      {
        id: "consultorios",
        titulo: "Consultorios",
        queEs: "Las salas o consultorios de cada sede.",
        impacto: "La agenda reserva un consultorio en cada cita: sin consultorios no se pueden agendar citas.",
        ...obligatorio(h.consultorios > 0),
        detalle: h.consultorios > 0 ? plural(h.consultorios, "consultorio", "consultorios") : undefined,
        href: PARAMETROS("general", "consultorios"),
        accion: "Crear consultorio",
      },
      {
        id: "marca",
        titulo: "Logo y nombre comercial",
        queEs: "El logo y el nombre con el que te conocen los pacientes.",
        impacto: "Si no los pones, los correos y documentos salen con un diseño genérico, sin tu marca.",
        ...recomendado(Boolean(c.logo && c.nombreComercial)),
        href: "/suscripcion",
        accion: "Personalizar",
      },
      {
        id: "equipo",
        titulo: "Tu equipo",
        queEs: "Los médicos y el personal que usarán EWAH, cada uno con su usuario.",
        impacto:
          "Mientras solo exista tu usuario, todas las citas, tratamientos y evoluciones quedarán a tu nombre y no podrás ver la agenda por profesional.",
        ...recomendado(h.usuariosActivos > 1),
        detalle: plural(h.usuariosActivos, "usuario activo", "usuarios activos"),
        href: "/usuarios",
        accion: "Invitar usuarios",
      },
    ],
  });

  if (activos.has("pacientes")) {
    modulos.push({
      codigo: "pacientes",
      titulo: "Pacientes",
      paraQue: "La ficha de cada paciente: datos, atenciones, tratamientos y citas.",
      puntos: [
        {
          id: "catalogos-pacientes",
          titulo: "Listas de pacientes",
          queEs: "Tipos de documento, géneros, EPS y países.",
          impacto: "Las administra EWAH Tech y ya vienen listas: no tienes que hacer nada.",
          tipo: "recomendado",
          estado: "listo",
          href: PARAMETROS("pacientes"),
          accion: "Ver listas",
        },
        {
          id: "pacientes",
          titulo: "Tus pacientes",
          queEs: "Los pacientes que ya atiende la clínica.",
          impacto:
            "No es obligatorio para empezar: puedes crearlos a medida que lleguen. Si ya tienes una lista en Excel, impórtala y tendrás su historial desde el primer día.",
          ...recomendado(h.pacientes > 0),
          detalle: h.pacientes > 0 ? plural(h.pacientes, "paciente", "pacientes") : undefined,
          href: "/pacientes",
          accion: "Crear o importar",
        },
      ],
    });
  }

  if (activos.has("tratamientos")) {
    modulos.push({
      codigo: "tratamientos",
      titulo: "Tratamientos",
      paraQue: "Lo que haces a cada paciente y cuánto le cobras.",
      puntos: [
        {
          id: "tipos-tratamiento",
          titulo: "Tipos de tratamiento",
          queEs: "Los servicios que ofreces: consulta de valoración, toxina, láser…",
          impacto: "Sin tipos de tratamiento no se pueden registrar tratamientos ni agendar citas.",
          ...obligatorio(h.tiposTratamiento > 0),
          detalle: h.tiposTratamiento > 0 ? plural(h.tiposTratamiento, "tipo", "tipos") : undefined,
          href: PARAMETROS("tratamientos", "tipos_tratamiento"),
          accion: "Crear tipos",
        },
        {
          id: "medios-pago",
          titulo: "Medios de pago",
          queEs: "Cómo te pagan los pacientes: efectivo, datáfono, transferencia, link de pago…",
          impacto: "Cada tratamiento pide su medio de pago: sin medios de pago no se pueden registrar tratamientos.",
          ...obligatorio(h.mediosPago > 0),
          detalle: h.mediosPago > 0 ? plural(h.mediosPago, "medio", "medios") : undefined,
          href: PARAMETROS("tratamientos", "medios_pago"),
          accion: "Crear medios",
        },
        {
          id: "cups",
          titulo: "Código CUPS de cada tratamiento",
          queEs: "El código oficial del procedimiento (Clasificación Única de Procedimientos en Salud).",
          impacto:
            "Lo piden los reportes a entidades (RIPS) y la facturación electrónica en salud. Sin él, esos tratamientos no podrán reportarse.",
          ...recomendado(h.tiposTratamiento > 0 && h.tiposSinCups === 0),
          detalle: h.tiposSinCups > 0 ? `${plural(h.tiposSinCups, "tipo", "tipos")} sin CUPS` : undefined,
          href: PARAMETROS("tratamientos", "tipos_tratamiento"),
          accion: "Asignar CUPS",
        },
        {
          id: "servicio-tratamiento",
          titulo: "Servicio habilitado de cada tratamiento",
          queEs: "A qué servicio habilitado (Resolución 3100) pertenece cada tratamiento.",
          impacto: "Sirve para saber qué servicios prestas de verdad y para el módulo de Habilitación.",
          ...recomendado(h.tiposTratamiento > 0 && h.tiposSinServicio === 0),
          detalle: h.tiposSinServicio > 0 ? `${plural(h.tiposSinServicio, "tipo", "tipos")} sin servicio` : undefined,
          href: PARAMETROS("tratamientos", "tipos_tratamiento"),
          accion: "Asignar servicio",
        },
      ],
    });
  }

  if (activos.has("citas")) {
    modulos.push({
      codigo: "citas",
      titulo: "Agenda",
      paraQue: "Las citas de tus pacientes y los recordatorios por correo.",
      puntos: [
        {
          id: "consultorios",
          titulo: "Consultorios para agendar",
          queEs: "Cada cita ocupa un consultorio de una sede.",
          impacto: "Sin consultorios la agenda no deja crear citas.",
          ...obligatorio(h.consultorios > 0),
          href: PARAMETROS("general", "consultorios"),
          accion: "Crear consultorio",
        },
        {
          id: "correo-citas",
          titulo: "Correo para avisos de citas",
          queEs: "El correo de la clínica que verán los pacientes en los avisos de sus citas.",
          impacto: "Si no lo configuras, los avisos salen con el correo general de EWAH y el paciente no puede responderte directamente.",
          ...recomendado(Boolean(c.correoNotificaciones)),
          href: "/suscripcion",
          accion: "Configurar correo",
        },
      ],
    });
  }

  if (activos.has("inventario") && h.insumos !== null) {
    modulos.push({
      codigo: "inventario",
      titulo: "Inventario",
      paraQue: "Los insumos que usas (toxina, rellenos, jeringas…), sus lotes y su consumo en cada tratamiento.",
      puntos: [
        {
          id: "insumos",
          titulo: "Insumos",
          queEs: "El catálogo de lo que compras y gastas en los tratamientos.",
          impacto: "Sin insumos no se pueden registrar entradas al inventario ni el consumo en los tratamientos.",
          ...obligatorio(h.insumos > 0),
          detalle: h.insumos > 0 ? plural(h.insumos, "insumo", "insumos") : undefined,
          href: PARAMETROS("inventario", "insumos"),
          accion: "Crear insumos",
        },
        {
          id: "proveedores",
          titulo: "Proveedores",
          queEs: "A quién le compras.",
          impacto: "Sin proveedores no sabrás a quién le compraste cada lote, y los reportes de INVIMA quedan incompletos.",
          ...recomendado((h.proveedores ?? 0) > 0),
          detalle: (h.proveedores ?? 0) > 0 ? plural(h.proveedores ?? 0, "proveedor", "proveedores") : undefined,
          href: PARAMETROS("inventario", "proveedores"),
          accion: "Crear proveedores",
        },
      ],
    });
  }

  if (activos.has("finanzas") && h.finanzas) {
    const f = h.finanzas;
    modulos.push({
      codigo: "finanzas",
      titulo: "Flujo de caja",
      paraQue: "Cuánta plata tienes, cuánta entra, cuánta sale y en qué.",
      puntos: [
        {
          id: "finanzas-activar",
          titulo: "Activar el flujo de caja",
          queEs: "Decir desde qué fecha llevas la caja y cuánta plata había en cada cuenta.",
          impacto: "Mientras no lo actives, los pagos de los pacientes no se anotan como ingresos y no verás cuánta plata tienes.",
          ...obligatorio(f.activado),
          href: "/finanzas",
          accion: "Activar",
        },
        {
          id: "finanzas-medios",
          titulo: "A dónde llega cada medio de pago",
          queEs: "Para cada medio de pago, la cuenta a la que llega la plata (caja, banco, pasarela…).",
          impacto:
            "Los tratamientos pagados con un medio sin cuenta no entran solos al flujo de caja: quedan pendientes en Cobros hasta que lo asignes.",
          ...obligatorio(f.activado && f.mediosSinDestino === 0),
          detalle: f.mediosSinDestino > 0 ? `${plural(f.mediosSinDestino, "medio", "medios")} sin cuenta` : undefined,
          href: "/finanzas/configuracion?tab=medios",
          accion: "Asignar cuentas",
        },
        {
          id: "finanzas-tarifas",
          titulo: "Tarifa de la pasarela de pago",
          queEs: "Lo que te cobra la pasarela (Bold, Wompi…) por cada pago con tarjeta.",
          impacto: "Sin tarifa, EWAH espera que llegue el valor completo y la diferencia con lo que realmente llega aparece como ajuste.",
          ...recomendado(f.pasarelasSinTarifa === 0),
          detalle: f.pasarelasSinTarifa > 0 ? `${plural(f.pasarelasSinTarifa, "medio", "medios")} de pasarela sin tarifa` : undefined,
          href: "/finanzas/configuracion?tab=medios",
          accion: "Poner tarifa",
        },
      ],
    });
  }

  if ((activos.has("rrhh") || activos.has("medio_ambiente")) && h.empleados !== null) {
    const puntos: Punto[] = [
      {
        id: "empleados",
        titulo: "Empleados",
        queEs: "Las personas que trabajan en la clínica (tengan o no usuario en EWAH).",
        impacto: activos.has("rrhh")
          ? "Sin empleados no hay nómina, ni registro de bitácoras de medio ambiente ni de SG-SST a nombre de alguien."
          : "Las bitácoras de medio ambiente (temperatura, limpieza, residuos) piden quién las hizo.",
        ...obligatorio(h.empleados > 0),
        detalle: h.empleados > 0 ? plural(h.empleados, "empleado", "empleados") : undefined,
        href: "/rrhh",
        accion: "Crear empleados",
      },
    ];
    if (activos.has("rrhh")) {
      puntos.unshift({
        id: "cargos",
        titulo: "Cargos",
        queEs: "Los cargos de la clínica (médico, auxiliar, recepción…) con su nivel de riesgo laboral.",
        impacto: "Cada empleado necesita un cargo; el cargo define el aporte a la ARL en la nómina.",
        ...obligatorio((h.cargos ?? 0) > 0),
        detalle: (h.cargos ?? 0) > 0 ? plural(h.cargos ?? 0, "cargo", "cargos") : undefined,
        href: PARAMETROS("rrhh", "cargos"),
        accion: "Crear cargos",
      });
      puntos.push({
        id: "valores-legales",
        titulo: "Salario mínimo y auxilio de transporte del año",
        queEs: "Los valores legales del año que usa la nómina.",
        impacto: "Los carga EWAH Tech cada año. Si faltan, la nómina no puede calcularse: avísanos.",
        ...obligatorio(Boolean(h.valoresLegalesAnio)),
        href: PARAMETROS("rrhh", "valores_legales_pais"),
        accion: "Ver valores",
      });
    }
    modulos.push({
      codigo: "personal",
      titulo: activos.has("rrhh") ? "Recursos humanos" : "Personal",
      paraQue: "Las personas que trabajan en la clínica, sus cargos y su nómina.",
      puntos,
    });
  }

  if (activos.has("medio_ambiente") && h.neveras !== null) {
    modulos.push({
      codigo: "medio_ambiente",
      titulo: "Medio ambiente",
      paraQue: "Temperatura y humedad, cadena de frío, residuos, extintores y limpieza.",
      puntos: [
        {
          id: "neveras",
          titulo: "Neveras",
          queEs: "Las neveras de cada sede donde guardas medicamentos o insumos que necesitan frío.",
          impacto: "Sin neveras no puedes llevar el registro de cadena de frío que piden en las visitas de habilitación.",
          ...recomendado(h.neveras > 0),
          detalle: h.neveras > 0 ? plural(h.neveras, "nevera", "neveras") : undefined,
          href: PARAMETROS("medio_ambiente", "neveras"),
          accion: "Crear neveras",
        },
      ],
    });
  }

  if (activos.has("habilitacion") && h.habilitacionPerfil !== null) {
    modulos.push({
      codigo: "habilitacion",
      titulo: "Habilitación",
      paraQue: "Cumplir la Resolución 3100: autoevaluación, documentos y obligaciones con vencimiento.",
      puntos: [
        {
          id: "servicios-habilitados",
          titulo: "Servicios habilitados",
          queEs: "Los servicios que tienes inscritos en el REPS, con su código, por sede.",
          impacto: "Sin servicios, EWAH no sabe qué estándares te aplican y la autoevaluación queda vacía.",
          ...obligatorio(h.serviciosHabilitados > 0),
          detalle: h.serviciosHabilitados > 0 ? plural(h.serviciosHabilitados, "servicio", "servicios") : undefined,
          href: "/parametros?abrir=datos-basicos",
          accion: "Registrar servicios",
        },
        {
          id: "perfil-prestador",
          titulo: "Perfil del prestador",
          queEs: "Tipo de prestador, estado en el REPS y fechas clave.",
          impacto: "Sin el perfil no se calculan tus obligaciones ni sus fechas de vencimiento, y no recibirás alertas.",
          ...obligatorio(h.habilitacionPerfil),
          href: "/habilitacion/perfil",
          accion: "Completar perfil",
        },
      ],
    });
  }

  if (activos.has("sst") && h.sstPerfil !== null) {
    modulos.push({
      codigo: "sst",
      titulo: "SG-SST",
      paraQue: "El Sistema de Gestión de Seguridad y Salud en el Trabajo (Resolución 0312).",
      puntos: [
        {
          id: "sst-perfil",
          titulo: "Perfil de SG-SST y responsable",
          queEs: "Cuántos trabajadores tienes y quién es el responsable del SG-SST.",
          impacto: "Sin el perfil, EWAH no sabe qué estándares mínimos te aplican (7, 21 o 60) ni a quién enviar las alertas.",
          ...obligatorio(h.sstPerfil.existe && h.sstPerfil.responsable),
          href: "/sst",
          accion: "Completar perfil",
        },
      ],
    });
  }

  return modulos.filter((m) => m.puntos.length > 0);
}

export type ResumenConfiguracion = { obligatorios: number; listos: number; faltan: number; recomendados: number };

// Un mismo punto puede aparecer en dos módulos (los consultorios en Tu
// clínica y en Agenda): se cuenta una vez.
export function resumirConfiguracion(modulos: ModuloConfiguracion[]): ResumenConfiguracion {
  const unicos = new Map<string, Punto>();
  for (const m of modulos) for (const p of m.puntos) if (!unicos.has(p.id)) unicos.set(p.id, p);
  const todos = [...unicos.values()];
  const obligatorios = todos.filter((p) => p.tipo === "obligatorio");
  return {
    obligatorios: obligatorios.length,
    listos: obligatorios.filter((p) => p.estado === "listo").length,
    faltan: obligatorios.filter((p) => p.estado === "pendiente").length,
    recomendados: todos.filter((p) => p.tipo === "recomendado" && p.estado === "pendiente").length,
  };
}

export function estadoModulo(m: ModuloConfiguracion): "completo" | "faltan" | "sugerencias" {
  if (m.puntos.some((p) => p.tipo === "obligatorio" && p.estado === "pendiente")) return "faltan";
  if (m.puntos.some((p) => p.estado === "pendiente")) return "sugerencias";
  return "completo";
}
