import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CATALOGOS } from "@/lib/parametros/registry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogoTable } from "./catalogo-table";
import { AddValorDialog } from "./add-valor-dialog";
import { ConsultoriosTable, type ConsultorioRow } from "./consultorios-table";
import { ConsultorioDialog } from "./consultorio-dialog";
import { InsumosTable, type InsumoRow } from "./insumos-table";
import { InsumoDialog } from "./insumo-dialog";
import { ProveedoresTable, type ProveedorRow } from "./proveedores-table";
import { ProveedorDialog } from "./proveedor-dialog";
import { getSedesActivas, getTiposIdentificacionActivos, getProveedoresActivos } from "@/lib/catalogos";

export default async function ParametrosPage() {
  await requireUsuario();
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

  const [resultados, sedes, tiposIdentificacion, proveedoresActivos, consultoriosData, insumosData, proveedoresData] =
    await Promise.all([
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
        .from("insumos")
        .select(
          `id, nombre, codigo, unidad_medida, proveedor_id, registro_invima,
           unidad_medida_invima, fecha_vencimiento_registro_invima,
           referencia_reportada, presentacion_comercial_reportada, reporte_invima,
           activo, proveedores(nombre)`,
        )
        .order("orden"),
      supabase
        .from("proveedores")
        .select("id, nombre, tipo_identificacion_id, numero_identificacion, observaciones, activo, tipos_identificacion(nombre)")
        .order("orden"),
    ]);

  const bespoke = [
    {
      tabla: "consultorios",
      nombre: "Consultorios",
      descripcion: "Salas/consultorios de tu clínica, cada uno asociado a una sede.",
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
      tabla: "insumos",
      nombre: "Insumos",
      descripcion: "Catálogo de insumos que usa tu clínica, con proveedor y datos de reporte INVIMA.",
      accion: (
        <InsumoDialog
          proveedores={proveedoresActivos}
          trigger={<Button size="sm">Agregar insumo</Button>}
        />
      ),
      tabla_ui: (
        <InsumosTable
          valores={(insumosData.data ?? []) as unknown as InsumoRow[]}
          proveedores={proveedoresActivos}
          editable
        />
      ),
    },
    {
      tabla: "proveedores",
      nombre: "Proveedores",
      descripcion: "Proveedores de insumos de tu clínica, con su identificación tributaria.",
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
  ];

  const todasLasPestañas = [...resultados, ...bespoke];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Parámetros</h1>
        <p className="text-sm text-muted-foreground">
          Catálogos de referencia que alimentan los menús desplegables de toda la
          plataforma (pacientes, insumos, y los módulos que siguen).
        </p>
      </div>

      <Tabs defaultValue={todasLasPestañas[0]?.tabla}>
        <TabsList>
          {todasLasPestañas.map((catalogo) => (
            <TabsTrigger key={catalogo.tabla} value={catalogo.tabla}>
              {catalogo.nombre}
            </TabsTrigger>
          ))}
        </TabsList>

        {resultados.map((catalogo) => (
          <TabsContent key={catalogo.tabla} value={catalogo.tabla}>
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
        ))}

        {bespoke.map((catalogo) => (
          <TabsContent key={catalogo.tabla} value={catalogo.tabla}>
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
        ))}
      </Tabs>
    </div>
  );
}
