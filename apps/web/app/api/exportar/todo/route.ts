import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminExport } from "@/lib/exportar/acceso";
import { construirLibroXlsx, nombreArchivoXlsx, type ColumnaXlsx } from "@/lib/exportar/xlsx";
import { esTablaNegocioValida } from "@/lib/exportar/tablasNegocio";
import { COLUMNAS_PACIENTES, obtenerFilasExportPacientes } from "@/lib/pacientes/exportar";
import { COLUMNAS_CATALOGO } from "@/lib/parametros/exportar";
import { CATALOGOS } from "@/lib/parametros/registry";
import { nombreCompleto } from "@/lib/pacientes/nombre";
import { formatoMoneda } from "@/lib/format";
import { listarFunnelCampana } from "@/lib/campanas/actions";

type Hoja = { nombre: string; columnas: ColumnaXlsx[]; filas: Record<string, unknown>[] };
type Supabase = Awaited<ReturnType<typeof createClient>>;

async function hojasTratamientos(supabase: Supabase): Promise<Hoja[]> {
  const { data } = await supabase
    .from("tratamientos")
    .select(
      `fecha, costo, valor_cobrado, notas, anulado, anulado_motivo,
       pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido),
       tipos_tratamiento(nombre), sedes(nombre),
       profesional:usuarios!tratamientos_profesional_id_fkey(nombre)`,
    )
    .order("fecha", { ascending: false });
  type Fila = {
    fecha: string; costo: number | null; valor_cobrado: number | null; notas: string | null; anulado: boolean; anulado_motivo: string | null;
    pacientes: { primer_nombre: string; segundo_nombre: string | null; primer_apellido: string; segundo_apellido: string | null } | null;
    tipos_tratamiento: { nombre: string } | null; sedes: { nombre: string } | null; profesional: { nombre: string } | null;
  };
  const filas = ((data ?? []) as unknown as Fila[]).map((t) => ({
    fecha: t.fecha, paciente: t.pacientes ? nombreCompleto(t.pacientes) : "",
    tratamiento: t.tipos_tratamiento?.nombre ?? "", sede: t.sedes?.nombre ?? "",
    profesional: t.profesional?.nombre ?? "", valor: t.costo ? formatoMoneda(t.costo) : "",
    cobrado: t.valor_cobrado !== null ? formatoMoneda(t.valor_cobrado) : "",
    notas: t.notas ?? "", anulado: t.anulado ? "Sí" : "No", anulado_motivo: t.anulado_motivo ?? "",
  }));
  return [{
    nombre: "Tratamientos",
    columnas: [
      { header: "Fecha", key: "fecha" }, { header: "Paciente", key: "paciente" },
      { header: "Tratamiento", key: "tratamiento" }, { header: "Sede", key: "sede" },
      { header: "Profesional", key: "profesional" }, { header: "Precio", key: "valor" },
      { header: "Valor cobrado", key: "cobrado" },
      { header: "Observaciones", key: "notas" }, { header: "Anulado", key: "anulado" },
      { header: "Motivo de anulación", key: "anulado_motivo" },
    ],
    filas,
  }];
}

async function hojasCitas(supabase: Supabase): Promise<Hoja[]> {
  const { data } = await supabase
    .from("citas")
    .select(
      `fecha, hora_inicio, hora_fin, estado, es_bloqueo, motivo,
       pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido),
       tipos_tratamiento(nombre), consultorios(nombre, sedes(nombre)),
       profesional:usuarios!citas_profesional_id_fkey(nombre)`,
    )
    .order("fecha", { ascending: false });
  type Fila = {
    fecha: string; hora_inicio: string; hora_fin: string; estado: string; es_bloqueo: boolean; motivo: string | null;
    pacientes: { primer_nombre: string; segundo_nombre: string | null; primer_apellido: string; segundo_apellido: string | null } | null;
    tipos_tratamiento: { nombre: string } | null; consultorios: { nombre: string; sedes: { nombre: string } | null } | null;
    profesional: { nombre: string } | null;
  };
  const filas = ((data ?? []) as unknown as Fila[]).map((c) => ({
    fecha: c.fecha, hora_inicio: c.hora_inicio?.slice(0, 5) ?? "", hora_fin: c.hora_fin?.slice(0, 5) ?? "",
    paciente: c.pacientes ? nombreCompleto(c.pacientes) : c.es_bloqueo ? "(Bloqueo)" : "",
    tratamiento: c.tipos_tratamiento?.nombre ?? "", profesional: c.profesional?.nombre ?? "",
    sede: c.consultorios?.sedes?.nombre ?? "", consultorio: c.consultorios?.nombre ?? "",
    estado: c.es_bloqueo ? "Bloqueo" : c.estado, motivo: c.motivo ?? "",
  }));
  return [{
    nombre: "Agenda",
    columnas: [
      { header: "Fecha", key: "fecha" }, { header: "Hora inicio", key: "hora_inicio" },
      { header: "Hora fin", key: "hora_fin" }, { header: "Paciente", key: "paciente" },
      { header: "Tratamiento", key: "tratamiento" }, { header: "Profesional", key: "profesional" },
      { header: "Sede", key: "sede" }, { header: "Consultorio", key: "consultorio" },
      { header: "Estado", key: "estado" }, { header: "Motivo", key: "motivo" },
    ],
    filas,
  }];
}

async function hojasInventario(supabase: Supabase): Promise<Hoja[]> {
  const [{ data: lotesData }, { data: movData }] = await Promise.all([
    supabase.from("lotes").select("numero_lote, fecha_vencimiento, cantidad_actual, costo_unitario, activo, insumos(nombre), sedes(nombre)"),
    supabase.from("movimientos_insumos").select("created_at, tipo, cantidad, motivo, lotes(numero_lote, insumos(nombre), sedes(nombre))"),
  ]);
  type FilaLote = { numero_lote: string; fecha_vencimiento: string | null; cantidad_actual: number; costo_unitario: number | null; activo: boolean; insumos: { nombre: string } | null; sedes: { nombre: string } | null };
  type FilaMov = { created_at: string; tipo: string; cantidad: number; motivo: string | null; lotes: { numero_lote: string; insumos: { nombre: string } | null; sedes: { nombre: string } | null } | null };
  const filasLotes = ((lotesData ?? []) as unknown as FilaLote[]).map((l) => ({
    insumo: l.insumos?.nombre ?? "", sede: l.sedes?.nombre ?? "", numero_lote: l.numero_lote,
    vencimiento: l.fecha_vencimiento ?? "", cantidad: l.cantidad_actual, costo_unitario: l.costo_unitario ?? "",
    activo: l.activo ? "Sí" : "No",
  }));
  const filasMov = ((movData ?? []) as unknown as FilaMov[]).map((m) => ({
    fecha: m.created_at?.slice(0, 10) ?? "", insumo: m.lotes?.insumos?.nombre ?? "", sede: m.lotes?.sedes?.nombre ?? "",
    lote: m.lotes?.numero_lote ?? "", tipo: m.tipo, cantidad: m.cantidad, motivo: m.motivo ?? "",
  }));
  return [
    { nombre: "Inventario actual", columnas: [
      { header: "Insumo", key: "insumo" }, { header: "Sede", key: "sede" }, { header: "Número de lote", key: "numero_lote" },
      { header: "Vencimiento", key: "vencimiento" }, { header: "Cantidad actual", key: "cantidad" },
      { header: "Costo unitario", key: "costo_unitario" }, { header: "Activo", key: "activo" },
    ], filas: filasLotes },
    { nombre: "Movimientos inventario", columnas: [
      { header: "Fecha", key: "fecha" }, { header: "Insumo", key: "insumo" }, { header: "Sede", key: "sede" },
      { header: "Lote", key: "lote" }, { header: "Tipo", key: "tipo" }, { header: "Cantidad", key: "cantidad" },
      { header: "Motivo", key: "motivo" },
    ], filas: filasMov },
  ];
}

async function hojasUsuarios(supabase: Supabase): Promise<Hoja[]> {
  const { data } = await supabase.from("usuarios").select("nombre, email, activo, bloqueado, roles(nombre)").order("nombre");
  type Fila = { nombre: string; email: string; activo: boolean; bloqueado: boolean; roles: { nombre: string } | null };
  const filas = ((data ?? []) as unknown as Fila[]).map((u) => ({
    nombre: u.nombre, email: u.email, rol: u.roles?.nombre ?? "",
    estado: u.bloqueado ? "Bloqueado" : u.activo ? "Activo" : "Desactivado",
  }));
  return [{
    nombre: "Usuarios",
    columnas: [
      { header: "Nombre", key: "nombre" }, { header: "Correo", key: "email" },
      { header: "Rol", key: "rol" }, { header: "Estado", key: "estado" },
    ],
    filas,
  }];
}

async function hojasCampanas(supabase: Supabase): Promise<Hoja[]> {
  const { data } = await supabase
    .from("campanas")
    .select("id, nombre, fecha_inicio, fecha_fin, presupuesto, objetivo, activo, canales_captacion(nombre)")
    .order("created_at", { ascending: false });
  type Fila = { id: string; nombre: string; fecha_inicio: string | null; fecha_fin: string | null; presupuesto: number | null; objetivo: string | null; activo: boolean; canales_captacion: { nombre: string } | null };
  const campanas = (data ?? []) as unknown as Fila[];
  const funnels = await Promise.all(campanas.map((c) => listarFunnelCampana(c.id)));
  const filas = campanas.map((c, i) => ({
    nombre: c.nombre, canal: c.canales_captacion?.nombre ?? "", fecha_inicio: c.fecha_inicio ?? "",
    fecha_fin: c.fecha_fin ?? "", presupuesto: c.presupuesto ? formatoMoneda(c.presupuesto) : "",
    objetivo: c.objetivo ?? "", activa: c.activo ? "Sí" : "No", leads: funnels[i].leads,
    contactados: funnels[i].contactados, agendaron_cita: funnels[i].agendaronCita,
    convertidos: funnels[i].convertidos, ingresos: formatoMoneda(funnels[i].ingresos),
  }));
  return [{
    nombre: "Campañas",
    columnas: [
      { header: "Campaña", key: "nombre" }, { header: "Canal", key: "canal" }, { header: "Fecha inicio", key: "fecha_inicio" },
      { header: "Fecha fin", key: "fecha_fin" }, { header: "Presupuesto", key: "presupuesto" }, { header: "Objetivo", key: "objetivo" },
      { header: "Activa", key: "activa" }, { header: "Leads", key: "leads" }, { header: "Contactados", key: "contactados" },
      { header: "Agendaron cita", key: "agendaron_cita" }, { header: "Convertidos", key: "convertidos" }, { header: "Ingresos", key: "ingresos" },
    ],
    filas,
  }];
}

async function hojasMedioAmbiente(supabase: Supabase): Promise<Hoja[]> {
  const [{ data: tc }, { data: tn }, { data: res }, { data: ext }, { data: lim }] = await Promise.all([
    supabase.from("registros_temperatura_consultorio").select("fecha, hora, jornada, temperatura_celsius, humedad_porcentaje, observaciones, consultorios(nombre)"),
    supabase.from("registros_temperatura_nevera").select("fecha, hora, jornada, temperatura_celsius, observaciones, neveras(nombre)"),
    supabase.from("registros_residuos").select("fecha, hora, jornada, tipo_residuo, peso_kg, observaciones, sedes(nombre), empleados(nombre)"),
    supabase.from("extintores").select("ubicacion, numero_serie, capacidad, fecha_vencimiento, activo, sedes(nombre), tipos_extintor(nombre)"),
    supabase.from("registros_limpieza").select("fecha, hora, jornada, area_tipo, area_nombre, observaciones, sedes(nombre), empleados(nombre)"),
  ]);
  const colTemp: ColumnaXlsx[] = [
    { header: "Fecha", key: "fecha" }, { header: "Hora", key: "hora" }, { header: "Jornada", key: "jornada" },
    { header: "Ubicación", key: "ubicacion" }, { header: "Temperatura (°C)", key: "temperatura" },
    { header: "Humedad (%)", key: "humedad" }, { header: "Observaciones", key: "observaciones" },
  ];
  type R = Record<string, unknown>;
  const fTc = ((tc ?? []) as unknown as R[]).map((r) => ({
    fecha: r.fecha, hora: (r.hora as string)?.slice(0, 5) ?? "", jornada: r.jornada ?? "",
    ubicacion: (r.consultorios as { nombre: string } | null)?.nombre ?? "", temperatura: r.temperatura_celsius,
    humedad: r.humedad_porcentaje ?? "", observaciones: r.observaciones ?? "",
  }));
  const fTn = ((tn ?? []) as unknown as R[]).map((r) => ({
    fecha: r.fecha, hora: (r.hora as string)?.slice(0, 5) ?? "", jornada: r.jornada ?? "",
    ubicacion: (r.neveras as { nombre: string } | null)?.nombre ?? "", temperatura: r.temperatura_celsius,
    humedad: "", observaciones: r.observaciones ?? "",
  }));
  const fRes = ((res ?? []) as unknown as R[]).map((r) => ({
    fecha: r.fecha, hora: (r.hora as string)?.slice(0, 5) ?? "", jornada: r.jornada ?? "",
    sede: (r.sedes as { nombre: string } | null)?.nombre ?? "", tipo: r.tipo_residuo, peso: r.peso_kg ?? "",
    empleado: (r.empleados as { nombre: string } | null)?.nombre ?? "", observaciones: r.observaciones ?? "",
  }));
  const fExt = ((ext ?? []) as unknown as R[]).map((r) => ({
    sede: (r.sedes as { nombre: string } | null)?.nombre ?? "", tipo: (r.tipos_extintor as { nombre: string } | null)?.nombre ?? "",
    ubicacion: r.ubicacion ?? "", numero_serie: r.numero_serie ?? "", capacidad: r.capacidad ?? "",
    vencimiento: r.fecha_vencimiento ?? "", activo: r.activo ? "Sí" : "No",
  }));
  const fLim = ((lim ?? []) as unknown as R[]).map((r) => ({
    fecha: r.fecha, hora: (r.hora as string)?.slice(0, 5) ?? "", jornada: r.jornada ?? "",
    sede: (r.sedes as { nombre: string } | null)?.nombre ?? "", area: r.area_nombre || r.area_tipo,
    empleado: (r.empleados as { nombre: string } | null)?.nombre ?? "", observaciones: r.observaciones ?? "",
  }));
  return [
    { nombre: "Temp. consultorios", columnas: colTemp, filas: fTc },
    { nombre: "Temp. neveras", columnas: colTemp, filas: fTn },
    { nombre: "Residuos", columnas: [
      { header: "Fecha", key: "fecha" }, { header: "Hora", key: "hora" }, { header: "Jornada", key: "jornada" },
      { header: "Sede", key: "sede" }, { header: "Tipo de residuo", key: "tipo" }, { header: "Peso (kg)", key: "peso" },
      { header: "Empleado", key: "empleado" }, { header: "Observaciones", key: "observaciones" },
    ], filas: fRes },
    { nombre: "Extintores", columnas: [
      { header: "Sede", key: "sede" }, { header: "Tipo", key: "tipo" }, { header: "Ubicación", key: "ubicacion" },
      { header: "Número de serie", key: "numero_serie" }, { header: "Capacidad", key: "capacidad" },
      { header: "Vencimiento", key: "vencimiento" }, { header: "Activo", key: "activo" },
    ], filas: fExt },
    { nombre: "Limpieza", columnas: [
      { header: "Fecha", key: "fecha" }, { header: "Hora", key: "hora" }, { header: "Jornada", key: "jornada" },
      { header: "Sede", key: "sede" }, { header: "Área", key: "area" }, { header: "Empleado", key: "empleado" },
      { header: "Observaciones", key: "observaciones" },
    ], filas: fLim },
  ];
}

async function hojasParametros(supabase: Supabase): Promise<Hoja[]> {
  const hojas = await Promise.all(
    CATALOGOS.map(async (c) => {
      const { data } = await supabase.from(c.tabla).select("codigo, nombre").order("orden");
      return {
        nombre: c.nombre,
        columnas: COLUMNAS_CATALOGO,
        filas: (data ?? []).map((f) => ({ codigo: f.codigo ?? "", nombre: f.nombre })),
      };
    }),
  );
  return hojas;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminExport();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No autorizado." },
      { status: 403 },
    );
  }

  // getAll (no .get) a propósito: un <form method="GET"> nativo con varias
  // casillas `name="tablas"` manda un par `tablas=x` por cada una marcada,
  // no un solo valor separado por comas.
  const tablas = request.nextUrl.searchParams.getAll("tablas").filter(esTablaNegocioValida);
  if (tablas.length === 0) {
    return NextResponse.json({ error: "Selecciona al menos una tabla para exportar." }, { status: 400 });
  }

  const supabase = await createClient();
  const hojasPorTabla: Record<string, () => Promise<Hoja[]>> = {
    pacientes: async () => [
      { nombre: "Pacientes", columnas: COLUMNAS_PACIENTES, filas: await obtenerFilasExportPacientes(supabase) },
    ],
    tratamientos: () => hojasTratamientos(supabase),
    citas: () => hojasCitas(supabase),
    inventario: () => hojasInventario(supabase),
    usuarios: () => hojasUsuarios(supabase),
    campanas: () => hojasCampanas(supabase),
    medio_ambiente: () => hojasMedioAmbiente(supabase),
    parametros: () => hojasParametros(supabase),
  };

  const todasLasHojas = (await Promise.all(tablas.map((t) => hojasPorTabla[t]()))).flat();

  const libro = construirLibroXlsx(todasLasHojas);

  return new NextResponse(libro, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoXlsx("ewah-datos")}"`,
    },
  });
}
