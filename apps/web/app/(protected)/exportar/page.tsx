import { DatabaseIcon, DownloadIcon } from "lucide-react";
import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { TABLAS_NEGOCIO } from "@/lib/exportar/tablasNegocio";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default async function ExportarPage() {
  const usuario = await requireUsuario();

  if (!esAdministrador(usuario)) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          No tienes permiso para ver esta página. Solo un Administrador puede exportar los
          datos de la clínica.
        </AlertDescription>
      </Alert>
    );
  }

  const todasLasTablas = TABLAS_NEGOCIO.map((t) => `tablas=${t.id}`).join("&");

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <DatabaseIcon className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Exportar datos</h1>
          <p className="text-sm text-muted-foreground">
            Descarga en un solo archivo .xlsx todas las tablas de tu clínica, o solo las que
            elijas. Cada tabla queda en su propia hoja dentro del mismo archivo.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Elige qué incluir</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="GET" action="/api/exportar/todo" className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TABLAS_NEGOCIO.map((tabla) => (
                <Label key={tabla.id} className="flex items-center gap-2 font-normal">
                  <Checkbox name="tablas" value={tabla.id} defaultChecked />
                  {tabla.label}
                </Label>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
              <Button type="submit" className="sm:flex-1">
                <DownloadIcon /> Exportar seleccionados
              </Button>
              <Button
                type="button"
                variant="outline"
                nativeButton={false}
                render={<a href={`/api/exportar/todo?${todasLasTablas}`} />}
              >
                <DownloadIcon /> Exportar todo
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
