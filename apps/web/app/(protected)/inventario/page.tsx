import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoteDialog } from "./lote-dialog";
import { AjusteDialog } from "./ajuste-dialog";
import { MovimientosDialog } from "./movimientos-dialog";

type LoteRow = {
  id: string;
  numero_lote: string | null;
  fecha_vencimiento: string | null;
  cantidad_actual: number;
  costo_unitario: number | null;
  proveedor: string | null;
  activo: boolean;
  insumos: { nombre: string; unidad_medida: string } | null;
  sedes: { nombre: string } | null;
};

function formatoMoneda(valor: number | null) {
  if (valor === null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

function porVencer(fecha: string | null) {
  if (!fecha) return false;
  const dias = (new Date(fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return dias <= 30;
}

export default async function InventarioPage() {
  await requireUsuario();
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "inventario",
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
    { data: puedeCrear },
    { data: puedeAjustar },
    { data: insumosData },
    { data: sedesData },
    { data: lotesData },
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "VOID" }),
    supabase.from("insumos").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("sedes").select("id, nombre").eq("activo", true).order("orden"),
    supabase
      .from("lotes")
      .select(
        `id, numero_lote, fecha_vencimiento, cantidad_actual, costo_unitario, proveedor, activo,
         insumos(nombre, unidad_medida), sedes(nombre)`,
      )
      .eq("activo", true)
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
  ]);

  const insumos = insumosData ?? [];
  const sedes = sedesData ?? [];
  const lotes = (lotesData ?? []) as unknown as LoteRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventario</h1>
          <p className="text-sm text-muted-foreground">
            Lotes de insumos por sede. El consumo se registra desde cada tratamiento.
          </p>
        </div>
        {puedeCrear ? (
          <LoteDialog insumos={insumos} sedes={sedes} trigger={<Button>Nuevo lote</Button>} />
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Lotes activos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Stock actual</TableHead>
                <TableHead>Costo unitario</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lotes.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    {l.insumos?.nombre ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.sedes?.nombre ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.numero_lote ?? "—"}
                  </TableCell>
                  <TableCell>
                    {l.fecha_vencimiento ? (
                      <Badge variant={porVencer(l.fecha_vencimiento) ? "outline" : "secondary"}>
                        {l.fecha_vencimiento}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className={l.cantidad_actual < 0 ? "text-destructive" : ""}>
                    {l.cantidad_actual} {l.insumos?.unidad_medida ?? ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatoMoneda(l.costo_unitario)}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2 text-right">
                    <MovimientosDialog loteId={l.id} />
                    {puedeAjustar ? <AjusteDialog loteId={l.id} /> : null}
                  </TableCell>
                </TableRow>
              ))}
              {lotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Todavía no hay lotes registrados.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
