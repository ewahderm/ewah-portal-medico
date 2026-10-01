import {
  UsersIcon,
  ClipboardListIcon,
  CalendarIcon,
  PackageIcon,
  MegaphoneIcon,
  LeafIcon,
  SlidersHorizontalIcon,
  type LucideIcon,
} from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CATALOGOS, type ModuloCatalogo } from "@/lib/parametros/registry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogoTable } from "./catalogo-table";
import { AddValorDialog } from "./add-valor-dialog";
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
import { getSedesActivas, getTiposIdentificacionActivos, getProveedoresActivos } from "@/lib/catalogos";

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
};

// Orden fijo de los grupos — "general" siempre primero, el resto en el
// mismo orden en que aparecen en el menú principal de la app.
const ORDEN_GRUPOS: ModuloCatalogo[] = [
  "general",
  "pacientes",
  "tratamientos",
  "citas",
  "inventario",
  "campanas",
  "medio_ambiente",
];

export default async function ParametrosPage() {
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
  ] = await Promise.all([
    Promise.all(
      CATALOGOS.map(async (catalogo) => {
        const { data } = await supabase
          .from(catalogo.tabla)
          .select("id, codigo, nombre, activo")
          .order("orden");
        return { ...catalogo, valores: data ?? [] };
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
      .select("id, nombre, tipo_identificacion_id, numero_identificacion, observaciones, activo, tipos_identificacion(nombre)")
      .order("orden"),
    supabase
      .from("motivos_movimiento_inventario")
      .select("id, nombre, categoria, codigo, activo")
      .order("categoria")
      .order("orden"),
    supabase.from("clinicas").select("agencia_regulatoria").single(),
    supabase
      .from("clinica_modulos")
      .select("modulos(codigo)")
      .eq("clinica_id", usuario.clinica_id)
      .eq("activo", true),
  ]);

  // "INVIMA" hoy — vive en clinicas.agencia_regulatoria para que una
  // clínica en otro país (FDA, COFEPRIS...) vea su propia agencia sin
  // tocar código.
  const agenciaRegulatoria = clinicaData.data?.agencia_regulatoria ?? "INVIMA";

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
          trigger={<Button size="sm">Agregar proveedor</Button>}
        />
      ),
      tabla_ui: (
        <ProveedoresTable
          valores={(proveedoresData.data ?? []) as unknown as ProveedorRow[]}
          tiposIdentificacion={tiposIdentificacion}
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
    pestañas: todasLasPestañas.filter((p) => p.modulo === modulo),
  })).filter((g) => g.pestañas.length > 0 && (g.modulo === "general" || codigosModulosActivos.has(g.modulo)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Parámetros</h1>
        <p className="text-sm text-muted-foreground">
          Catálogos de referencia que alimentan los menús desplegables de toda la
          plataforma, agrupados por el módulo que los usa.
        </p>
      </div>

      <Tabs defaultValue={grupos[0]?.modulo}>
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
            <Tabs defaultValue={pestañas[0]?.tabla}>
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
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>{catalogo.nombre}</CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {catalogo.descripcion}
                          </p>
                        </div>
                        {catalogo.esGlobal ? (
                          <Badge variant="outline">Administrado por EWAH Tech</Badge>
                        ) : (
                          <AddValorDialog tabla={catalogo.tabla} nombre={catalogo.nombre} />
                        )}
                      </CardHeader>
                      <CardContent>
                        <CatalogoTable
                          tabla={catalogo.tabla}
                          valores={catalogo.valores}
                          editable={!catalogo.esGlobal}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                ) : (
                  <TabsContent key={catalogo.tabla} value={catalogo.tabla} className="pt-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>{catalogo.nombre}</CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">{catalogo.descripcion}</p>
                        </div>
                        {catalogo.accion}
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
