import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CATALOGOS } from "@/lib/parametros/registry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogoTable } from "./catalogo-table";
import { AddValorDialog } from "./add-valor-dialog";

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

  const resultados = await Promise.all(
    CATALOGOS.map(async (catalogo) => {
      const { data } = await supabase
        .from(catalogo.tabla)
        .select("id, codigo, nombre, activo")
        .order("orden");
      return { ...catalogo, valores: data ?? [] };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Parámetros</h1>
        <p className="text-sm text-muted-foreground">
          Catálogos de referencia que alimentan los menús desplegables de toda la
          plataforma (pacientes, insumos, y los módulos que siguen).
        </p>
      </div>

      <Tabs defaultValue={resultados[0]?.tabla}>
        <TabsList>
          {resultados.map((catalogo) => (
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
      </Tabs>
    </div>
  );
}
