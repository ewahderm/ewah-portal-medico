import {
  UsersIcon,
  ClipboardListIcon,
  CalendarIcon,
  PackageIcon,
  MegaphoneIcon,
  LeafIcon,
  SlidersHorizontalIcon,
  BriefcaseIcon,
  Building2Icon,
  type LucideIcon,
} from "lucide-react";
import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CATALOGOS, type ModuloCatalogo } from "@/lib/parametros/registry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogoTable } from "./catalogo-table";
import { AddValorDialog } from "./add-valor-dialog";
import { ImportarCatalogoDialog } from "./importar-catalogo-dialog";
import { ExportarXlsxLink } from "../_components/exportar-xlsx-link";
import { ConsultoriosTable, type ConsultorioRow } from "./consultorios-table";
import { ConsultorioDialog } from "./consultorio-dialog";
import { NeverasTable, type NeveraRow } from "./neveras-table";
import { NeveraDialog } from "./nevera-dialog";
import { InsumosTable, type InsumoRow } from "./insumos-table";
import { InsumoDialog } from "./insumo-dialog";
import { ProveedoresTable, type ProveedorRow } from "./proveedores-table";
import { ProveedorDialog } from "./proveedor-dialog";
import { MotivosMovimientoTable, type MotivoMovimientoRow } from "./motivos-movimiento-table";
import { MotivoMovimientoDialog } from "./motivo-movimiento-dialog";
import { CargosTable, type CargoRow } from "./cargos-table";
import { CargoDialog } from "./cargo-dialog";
import { TiposTratamientoTable, type TipoTratamientoRow } from "./tipos-tratamiento-table";
import type { PrecioConAutor } from "./precios-tratamiento-dialog";
import { TipoTratamientoDialog } from "./tipo-tratamiento-dialog";
import { DatosBasicosClinicaDialog } from "./datos-basicos-clinica-dialog";
import {
  describirCodigosPorSede,
  type ServicioHabilitado,
} from "@/lib/clinicas/servicios-habilitados-tipos";
import { CupsTab } from "./cups-tab";
import { buscarCups } from "@/lib/parametros/cups";
import { formatoPorcentaje } from "@/lib/format";
import { ValoresLegalesTable, type ValorLegalRow } from "./valores-legales-table";
import {
  getSedesActivas,
  getTiposIdentificacionActivos,
  getProveedoresActivos,
  getClasesRiesgoActivas,
  getPaisesActivos,
  getTiposPersonaActivos,
  getTiposDocumentoPrestadorActivos,
  getRolesActorActivos,
  getTiposTransaccionInvimaActivos,
  getDepartamentosActivos,
  getCiudadesActivas,
  getCupsActivadosClinica,
  getPracticasMedicasActivas,
  getServiciosHabilitadosClinica,
} from "@/lib/catalogos";

// Mismo nombre/ícono que ya usa el launcher del dashboard
// (lib/modulos/registro.ts) para que "Medio Ambiente" se vea igual en los
// dos lados de la app — "general" es el único grupo sin módulo real detrás,
// por eso no está en ese registro y se define aparte.
const GRUPOS: Record<ModuloCatalogo, { nombre: string; icono: LucideIcon }> = {
  general: { nombre: "Generales", icono: SlidersHorizontalIcon },
  pacientes: { nombre: "Pacientes", icono: UsersIcon },
  tratamientos: { nombre: "Tratamientos", icono: ClipboardListIcon },
  citas: { nombre: "Agenda", icono: CalendarIcon },
  inventario: { nombre: "Inventario", icono: PackageIcon },
  campanas: { nombre: "Campañas", icono: MegaphoneIcon },
  medio_ambiente: { nombre: "Medio Ambiente", icono: LeafIcon },
  rrhh: { nombre: "Recursos Humanos", icono: BriefcaseIcon },
};

// Orden fijo de los grupos — "general" siempre primero, el resto en el
// mismo orden en que aparecen en el menú principal de la app.
const ORDEN_UBICACION = ["paises", "departamentos", "ciudades", "sedes", "consultorios"];
function posicionUbicacion(tabla: string): number {
  const i = ORDEN_UBICACION.indexOf(tabla);
  return i === -1 ? ORDEN_UBICACION.length : i;
}

const ORDEN_GRUPOS: ModuloCatalogo[] = [
  "general",
  "pacientes",
  "tratamientos",
  "citas",
  "inventario",
  "campanas",
  "medio_ambiente",
  "rrhh",
];

export default async function ParametrosPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireUsuario();
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "parametros",
    permiso_code: "VIEW",
  });

  if (!puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const [
    resultados,
    sedes,
    tiposIdentificacion,
    proveedoresActivos,
    consultoriosData,
    neverasData,
    insumosData,
    proveedoresData,
    motivosMovimientoData,
    clinicaData,
    modulosActivosData,
    cargosData,
    tiposTratamientoData,
    paises,
    tiposPersona,
    tiposDocumentoPrestador,
    rolesActor,
    tiposTransaccionInvima,
    departamentos,
    ciudades,
    cupsActivos,
    practicasMedicas,
    serviciosHabilitados,
    preciosTratamientoData,
  ] = await Promise.all([
    Promise.all(
      CATALOGOS.map(async (catalogo) => {
        const columnas = ["id, codigo, nombre, activo", ...(catalogo.columnasExtra ?? []).map((c) => c.campo)].join(", ");
        const { data } = await supabase.from(catalogo.tabla).select(columnas).order("orden");
        const filas = (data ?? []) as unknown as Record<string, unknown>[];
        return {
          ...catalogo,
          valores: filas.map((f) => ({
            id: f.id as string,
            codigo: (f.codigo as string | null) ?? null,
            nombre: f.nombre as string,
            activo: f.activo as boolean,
            extras: Object.fromEntries(
              (catalogo.columnasExtra ?? []).map((c) => [c.campo, (f[c.campo] as string | number | null) ?? null]),
            ),
          })),
        };
      }),
    ),
    getSedesActivas(supabase),
    getTiposIdentificacionActivos(supabase),
    getProveedoresActivos(supabase),
    supabase
      .from("consultorios")
      .select("id, nombre, codigo, activo, sede_id, sedes(nombre)")
      .order("orden"),
    supabase
      .from("neveras")
      .select("id, nombre, codigo, activo, sede_id, sedes(nombre)")
      .order("orden"),
    supabase
      .from("insumos")
      .select(
        `id, nombre, codigo, unidad_medida, proveedor_id, registro_sanitario,
         unidad_medida_registro_sanitario, fecha_vencimiento_registro_sanitario,
         referencia_reportada, presentacion_comercial_reportada, reporte_regulatorio,
         activo, proveedores(nombre)`,
      )
      .order("orden"),
    supabase
      .from("proveedores")
      .select(
        "id, nombre, tipo_identificacion_id, numero_identificacion, tipo_persona_id, observaciones, activo, tipos_identificacion(nombre), tipos_persona(nombre)",
      )
      .order("orden"),
    supabase
      .from("motivos_movimiento_inventario")
      .select("id, nombre, categoria, codigo, activo")
      .order("categoria")
      .order("orden"),
    supabase
      .from("clinicas")
      .select(
        `nombre, nombre_comercial, codigo_actividad_economica, nit, agencia_regulatoria,
         pais_operacion_id, exoneracion_aportes_salud_parafiscales,
         direccion, telefono, email, tipo_persona_id, tipo_documento_id, rol_actor_id,
         tipo_transaccion_invima_id, codigo_habilitacion, clase_riesgo_id, departamento_id, ciudad_id`,
      )
      .eq("id", usuario.clinica_id)
      .single(),
    supabase
      .from("clinica_modulos")
      .select("modulos(codigo)")
      .eq("clinica_id", usuario.clinica_id)
      .eq("activo", true),
    supabase
      .from("cargos")
      .select("id, nombre, codigo, activo, clase_riesgo_id, clases_riesgo(nombre, tarifa_arl)")
      .order("orden"),
    supabase
      .from("tipos_tratamiento")
      .select(
        // Los códigos por sede de la práctica llegan anidados; el RLS de
        // clinica_servicios_habilitados ya los limita a esta clínica.
        "id, nombre, codigo, practica_medica_id, cups_id, activo, cups(codigo, descripcion), practicas_medicas(nombre, clinica_servicios_habilitados(codigo_habilitacion, sedes(nombre)))",
      )
      .order("orden"),
    getPaisesActivos(supabase),
    getTiposPersonaActivos(supabase),
    getTiposDocumentoPrestadorActivos(supabase),
    getRolesActorActivos(supabase),
    getTiposTransaccionInvimaActivos(supabase),
    getDepartamentosActivos(supabase),
    getCiudadesActivas(supabase),
    getCupsActivadosClinica(supabase),
    getPracticasMedicasActivas(supabase),
    getServiciosHabilitadosClinica(supabase),
    supabase
      .from("precios_tratamiento")
      .select("tipo_tratamiento_id, valor, vigente_desde, created_at, autor:usuarios!precios_tratamiento_created_by_fkey(nombre)"),
  ]);

  const cupsTabInicial = await buscarCups("");

  // Opciones del desplegable de servicio en Tipos de tratamiento: las
  // prácticas que la clínica habilitó, una vez cada una aunque esté en
  // varias sedes (0061, decisión A) — el código depende de la sede.
  const filasPorPractica = new Map<string, { nombre: string; filas: ServicioHabilitado[] }>();
  for (const s of serviciosHabilitados) {
    if (!s.practicas_medicas) continue;
    const grupo = filasPorPractica.get(s.practicas_medicas.id) ?? { nombre: s.practicas_medicas.nombre, filas: [] };
    grupo.filas.push(s);
    filasPorPractica.set(s.practicas_medicas.id, grupo);
  }
  const serviciosOpciones = [...filasPorPractica.entries()].map(([id, { nombre, filas }]) => ({
    id,
    nombre: `${nombre} (${describirCodigosPorSede(filas)})`,
  }));

  // "INVIMA" hoy — vive en clinicas.agencia_regulatoria para que una
  // clínica en otro país (FDA, COFEPRIS...) vea su propia agencia sin
  // tocar código.
  const agenciaRegulatoria = clinicaData.data?.agencia_regulatoria ?? "INVIMA";
  const paisOperacionId = clinicaData.data?.pais_operacion_id ?? "";
  const exoneracionAportes = clinicaData.data?.exoneracion_aportes_salud_parafiscales ?? false;
  // La tarifa ARL (100% a cargo del empleador) va en la etiqueta: así se ve,
  // sin poder editarse, junto al riesgo elegido en Cargos y en Datos básicos.
  const { data: valoresLegalesData } = await supabase
    .from("valores_legales_pais")
    .select("id, anio, smlv, auxilio_transporte, norma")
    .eq("pais_id", paisOperacionId)
    .order("anio", { ascending: false });
  const valoresLegales = (valoresLegalesData ?? []) as ValorLegalRow[];

  const clasesRiesgo = (await getClasesRiesgoActivas(supabase, paisOperacionId)).map((c) => ({
    id: c.id,
    nombre: c.tarifa_arl === null ? c.nombre : `${c.nombre} · aporte ARL empleador ${formatoPorcentaje(Number(c.tarifa_arl))}`,
  }));
  const claseRiesgoDefaultId = clinicaData.data?.clase_riesgo_id ?? null;
  const datosBasicosClinica = {
    nombreLegal: clinicaData.data?.nombre ?? "",
    nombreComercial: clinicaData.data?.nombre_comercial ?? null,
    codigoActividadEconomica: clinicaData.data?.codigo_actividad_economica ?? null,
    paisOperacionId,
    exoneracionAportes,
    direccion: clinicaData.data?.direccion ?? null,
    telefono: clinicaData.data?.telefono ?? null,
    email: clinicaData.data?.email ?? null,
    tipoPersonaId: clinicaData.data?.tipo_persona_id ?? null,
    tipoDocumentoId: clinicaData.data?.tipo_documento_id ?? null,
    rolActorId: clinicaData.data?.rol_actor_id ?? null,
    tipoTransaccionInvimaId: clinicaData.data?.tipo_transaccion_invima_id ?? null,
    codigoHabilitacion: clinicaData.data?.codigo_habilitacion ?? null,
    nit: clinicaData.data?.nit ?? "",
    claseRiesgoId: claseRiesgoDefaultId,
    departamentoId: clinicaData.data?.departamento_id ?? null,
    ciudadId: clinicaData.data?.ciudad_id ?? null,
  };

  const codigosModulosActivos = new Set(
    (modulosActivosData.data ?? [])
      .map((m) => (m.modulos as unknown as { codigo: string } | null)?.codigo)
      .filter((c): c is string => !!c),
  );

  const bespoke = [
    {
      tabla: "consultorios",
      nombre: "Consultorios",
      descripcion: "Salas/consultorios de tu clínica, cada uno asociado a una sede.",
      modulo: "general" as ModuloCatalogo,
      accion: (
        <ConsultorioDialog
          sedes={sedes}
          trigger={<Button size="sm">Agregar consultorio</Button>}
        />
      ),
      tabla_ui: (
        <ConsultoriosTable
          valores={(consultoriosData.data ?? []) as unknown as ConsultorioRow[]}
          sedes={sedes}
          editable
        />
      ),
    },
    {
      tabla: "neveras",
      nombre: "Neveras",
      descripcion: "Neveras de cadena de frío de tu clínica, cada una asociada a una sede.",
      modulo: "medio_ambiente" as ModuloCatalogo,
      accion: (
        <NeveraDialog sedes={sedes} trigger={<Button size="sm">Agregar nevera</Button>} />
      ),
      tabla_ui: (
        <NeverasTable
          valores={(neverasData.data ?? []) as unknown as NeveraRow[]}
          sedes={sedes}
          editable
        />
      ),
    },
    {
      tabla: "insumos",
      nombre: "Insumos",
      descripcion: `Catálogo de insumos que usa tu clínica, con proveedor y datos de reporte ${agenciaRegulatoria}.`,
      modulo: "inventario" as ModuloCatalogo,
      accion: (
        <InsumoDialog
          proveedores={proveedoresActivos}
          agenciaRegulatoria={agenciaRegulatoria}
          trigger={<Button size="sm">Agregar insumo</Button>}
        />
      ),
      tabla_ui: (
        <InsumosTable
          valores={(insumosData.data ?? []) as unknown as InsumoRow[]}
          proveedores={proveedoresActivos}
          agenciaRegulatoria={agenciaRegulatoria}
          editable
        />
      ),
    },
    {
      tabla: "proveedores",
      nombre: "Proveedores",
      descripcion: "Proveedores de insumos de tu clínica, con su identificación tributaria.",
      modulo: "inventario" as ModuloCatalogo,
      accion: (
        <ProveedorDialog
          tiposIdentificacion={tiposIdentificacion}
          tiposPersona={tiposPersona}
          trigger={<Button size="sm">Agregar proveedor</Button>}
        />
      ),
      tabla_ui: (
        <ProveedoresTable
          valores={(proveedoresData.data ?? []) as unknown as ProveedorRow[]}
          tiposIdentificacion={tiposIdentificacion}
          tiposPersona={tiposPersona}
          editable
        />
      ),
    },
    {
      tabla: "cargos",
      nombre: "Cargos",
      descripcion: "Cargos de tu clínica, cada uno con su clase de riesgo para el cálculo de ARL en Nómina.",
      modulo: "rrhh" as ModuloCatalogo,
      accion: (
        <CargoDialog
          clasesRiesgo={clasesRiesgo}
          claseRiesgoDefaultId={claseRiesgoDefaultId}
          trigger={<Button size="sm">Agregar cargo</Button>}
        />
      ),
      tabla_ui: (
        <CargosTable
          valores={(cargosData.data ?? []) as unknown as CargoRow[]}
          clasesRiesgo={clasesRiesgo}
          editable
        />
      ),
    },
    {
      tabla: "valores_legales_pais",
      nombre: "Salario mínimo y auxilio de transporte",
      descripcion: "Valores legales de cada año con su decreto de origen — Nómina y Prestaciones usan el del año de cada período.",
      modulo: "rrhh" as ModuloCatalogo,
      accion: <Badge variant="outline">Administrado por EWAH Tech</Badge>,
      tabla_ui: <ValoresLegalesTable valores={valoresLegales} />,
    },
    {
      tabla: "cups",
      nombre: "CUPS",
      descripcion: "Clasificación Única de Procedimientos en Salud (~10.000 códigos) — activa los que tu clínica usa para poder asociarlos a un tipo de tratamiento.",
      modulo: "tratamientos" as ModuloCatalogo,
      accion: null,
      tabla_ui: <CupsTab inicial={cupsTabInicial} />,
    },
    {
      tabla: "tipos_tratamiento",
      nombre: "Tipos de tratamiento",
      descripcion: "Menú de tratamientos que ofrece tu clínica, con su código de habilitación y CUPS asociado.",
      modulo: "tratamientos" as ModuloCatalogo,
      accion: (
        <TipoTratamientoDialog cups={cupsActivos} servicios={serviciosOpciones} trigger={<Button size="sm">Agregar tipo de tratamiento</Button>} />
      ),
      tabla_ui: (
        <TiposTratamientoTable
          valores={(tiposTratamientoData.data ?? []) as unknown as TipoTratamientoRow[]}
          precios={((preciosTratamientoData.data ?? []) as unknown as PrecioConAutor[]).map((p) => ({ ...p, valor: Number(p.valor) }))}
          cups={cupsActivos}
          servicios={serviciosOpciones}
          editable
        />
      ),
    },
    {
      tabla: "motivos_movimiento_inventario",
      nombre: "Motivos de movimiento",
      descripcion: "Razones de entrada/salida de inventario que aparecen al registrar un movimiento (compra, desecho, obsequio...).",
      modulo: "inventario" as ModuloCatalogo,
      accion: (
        <MotivoMovimientoDialog trigger={<Button size="sm">Agregar motivo</Button>} />
      ),
      tabla_ui: (
        <MotivosMovimientoTable
          valores={(motivosMovimientoData.data ?? []) as unknown as MotivoMovimientoRow[]}
          editable
        />
      ),
    },
  ];

  const todasLasPestañas = [...resultados, ...bespoke];

  // Agrupa por módulo y descarta grupos vacíos o de un módulo que la
  // clínica no tiene contratado — "general" nunca se filtra, siempre debe
  // haber algo administrable (Sedes, Consultorios, Tipos de identificación).
  const grupos = ORDEN_GRUPOS.map((modulo) => ({
    modulo,
    pestañas: todasLasPestañas
      .filter((p) => p.modulo === modulo)
      // Ubicación primero (países → departamentos → ciudades → sedes →
      // consultorios); el resto conserva su orden. sort() es estable.
      .sort((a, b) => posicionUbicacion(a.tabla) - posicionUbicacion(b.tabla)),
  })).filter((g) => g.pestañas.length > 0 && (g.modulo === "general" || codigosModulosActivos.has(g.modulo)));

  // Enlaces directos (?grupo=…&catalogo=…), por ejemplo desde el asistente
  // de configuración. Un valor desconocido cae en la primera pestaña.
  const q = await searchParams;
  const grupoPedido = typeof q.grupo === "string" ? q.grupo : "";
  const grupoInicial = grupos.some((g) => g.modulo === grupoPedido) ? grupoPedido : grupos[0]?.modulo;
  const catalogoInicial = typeof q.catalogo === "string" ? q.catalogo : "";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Parámetros</h1>
          <p className="text-sm text-muted-foreground">
            Catálogos de referencia que alimentan los menús desplegables de toda la
            plataforma, agrupados por el módulo que los usa.
          </p>
        </div>
        {esAdministrador(usuario) && paisOperacionId ? (
          <DatosBasicosClinicaDialog
            abiertoInicial={q.abrir === "datos-basicos"}
            clinica={datosBasicosClinica}
            paises={paises}
            departamentos={departamentos}
            ciudades={ciudades}
            clasesRiesgo={clasesRiesgo}
            tiposPersona={tiposPersona}
            tiposDocumento={tiposDocumentoPrestador}
            rolesActor={rolesActor}
            tiposTransaccionInvima={tiposTransaccionInvima}
            practicasMedicas={practicasMedicas}
            sedes={sedes}
            serviciosHabilitados={serviciosHabilitados}
            trigger={
              <Button variant="outline" size="sm">
                <Building2Icon /> Datos básicos de la clínica
              </Button>
            }
          />
        ) : null}
      </div>

      <Tabs defaultValue={grupoInicial}>
        <TabsList className="w-full sm:w-fit">
          {grupos.map(({ modulo }) => {
            const Icono = GRUPOS[modulo].icono;
            return (
              <TabsTrigger key={modulo} value={modulo}>
                <Icono /> {GRUPOS[modulo].nombre}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {grupos.map(({ modulo, pestañas }) => (
          <TabsContent key={modulo} value={modulo} className="pt-4">
            <Tabs defaultValue={modulo === grupoInicial && pestañas.some((p) => p.tabla === catalogoInicial) ? catalogoInicial : pestañas[0]?.tabla}>
              <TabsList className="w-full sm:w-fit">
                {pestañas.map((catalogo) => (
                  <TabsTrigger key={catalogo.tabla} value={catalogo.tabla}>
                    {catalogo.nombre}
                  </TabsTrigger>
                ))}
              </TabsList>

              {pestañas.map((catalogo) =>
                "esGlobal" in catalogo ? (
                  <TabsContent key={catalogo.tabla} value={catalogo.tabla} className="pt-4">
                    <Card>
                      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <CardTitle>{catalogo.nombre}</CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {catalogo.descripcion}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {esAdministrador(usuario) ? (
                            <ExportarXlsxLink href={`/api/exportar/parametros/${catalogo.tabla}`} />
                          ) : null}
                          {catalogo.esGlobal ? (
                            <Badge variant="outline">Administrado por EWAH Tech</Badge>
                          ) : (
                            <>
                              {esAdministrador(usuario) ? (
                                <ImportarCatalogoDialog tabla={catalogo.tabla} nombre={catalogo.nombre} />
                              ) : null}
                              <AddValorDialog tabla={catalogo.tabla} nombre={catalogo.nombre} />
                            </>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CatalogoTable
                          tabla={catalogo.tabla}
                          valores={catalogo.valores}
                          columnasExtra={catalogo.columnasExtra}
                          editable={!catalogo.esGlobal}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                ) : (
                  <TabsContent key={catalogo.tabla} value={catalogo.tabla} className="pt-4">
                    <Card>
                      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <CardTitle>{catalogo.nombre}</CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">{catalogo.descripcion}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {esAdministrador(usuario) ? (
                            <ExportarXlsxLink href={`/api/exportar/parametros-bespoke/${catalogo.tabla}`} />
                          ) : null}
                          {catalogo.accion}
                        </div>
                      </CardHeader>
                      <CardContent>{catalogo.tabla_ui}</CardContent>
                    </Card>
                  </TabsContent>
                ),
              )}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
