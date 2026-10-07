"use client";

import { useActionState, useState, useTransition } from "react";
import { ChartNoAxesColumnIncreasingIcon, PencilIcon, SearchIcon } from "lucide-react";
import { obtenerReportePgirasa, revocarCeroResiduo } from "@/lib/medio-ambiente/actions";
import { ETIQUETAS_CORRIENTE } from "@/lib/medio-ambiente/constantes";
import type { ReportePgirasa } from "@/lib/medio-ambiente/calculo-pgirasa";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import type { Opcion } from "@/lib/forms/opciones";
import { MesAnioSelect } from "./mes-anio-select";
import { exigirExito } from "@/lib/forms/resultado";

const ETIQUETAS_CATEGORIA = {
  micro: "Microgenerador: menos de 10 kg/mes",
  pequeno: "Pequeño generador: desde 10 y menos de 100 kg/mes",
  mediano: "Mediano generador: desde 100 y menos de 1.000 kg/mes",
  grande: "Gran generador: 1.000 kg/mes o más",
};

const formatearKg = (kg: number) =>
  `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(kg)} kg`;

function etiquetaMes(mes: string) {
  return new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${mes}-01T00:00:00Z`));
}

// Para títulos y frases: "Febrero de 2025" (Intl lo da en minúscula).
function etiquetaMesTitulo(mes: string) {
  const texto = etiquetaMes(mes);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function ReportePgirasaTab({
  sedes,
  puedeEditar,
}: {
  sedes: Opcion[];
  puedeEditar: boolean;
}) {
  const [sedeId, setSedeId] = useState("");
  const [mes, setMes] = useState("");
  const [reporte, setReporte] = useState<ReportePgirasa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function buscar() {
    setError(null);
    startTransition(async () => {
      try {
        setReporte(exigirExito(await obtenerReportePgirasa(sedeId, mes)));
      } catch (e) {
        setReporte(null);
        setError(e instanceof Error ? e.message : "No se pudo cargar el reporte PGIRASA.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <ChartNoAxesColumnIncreasingIcon className="size-4 text-primary" />
            Consolidado PGIRASA por sede
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Elige un mes ya cerrado. El promedio de residuos peligrosos incluye ese mes y los cinco anteriores;
            se calcula por sede y no sustituye el consolidado mensual de todas las corrientes.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pgirasaSede">Sede</Label>
              <Combobox
                id="pgirasaSede"
                items={sedes.map((sede) => ({ value: sede.id, label: sede.nombre }))}
                value={sedeId}
                onValueChange={(value) => setSedeId(String(value ?? ""))}
                placeholder="Buscar sede..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pgirasaMes">Mes evaluado</Label>
              <MesAnioSelect id="pgirasaMes" onValueChange={setMes} />
            </div>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end">
            <Button onClick={buscar} disabled={pending || !sedeId || !mes}>
              <SearchIcon /> {pending ? "Calculando..." : "Calcular reporte"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {reporte ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Promedio móvil de residuos peligrosos · {etiquetaMesTitulo(reporte.mesEvaluado)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Resolución 0591 de 2024, Manual PGIRASA, ejemplo del § 5.2: suma de seis cantidades mensuales dividida entre seis.
                Los meses sin pesaje peligroso requieren confirmación expresa de 0 kg.
              </p>
              {reporte.promedioPeligrosos.categoria ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 p-4">
                  <Badge>{ETIQUETAS_CATEGORIA[reporte.promedioPeligrosos.categoria]}</Badge>
                  <span className="text-lg font-semibold">
                    {formatearKg(reporte.promedioPeligrosos.kilogramosMes ?? 0)} / mes
                  </span>
                </div>
              ) : (
                <Alert>
                  <AlertDescription>
                    No se puede clasificar todavía: faltan registros o confirmaciones de 0 kg para{" "}
                    {reporte.promedioPeligrosos.mesesFaltantes.map(etiquetaMesTitulo).join(", ")}.
                  </AlertDescription>
                </Alert>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead>Residuos peligrosos</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reporte.promedioPeligrosos.meses.map(({ mes: mesFila, peso }) => (
                    <TableRow key={mesFila}>
                      <TableCell className="capitalize">{etiquetaMes(mesFila)}</TableCell>
                      <TableCell>{peso.estado === "faltante" ? "—" : formatearKg(peso.kilogramos)}</TableCell>
                      <TableCell>
                        <Badge variant={peso.estado === "faltante" ? "destructive" : "outline"}>
                          {peso.estado === "medido" ? "Pesaje registrado" : peso.estado === "cero_confirmado" ? "Cero confirmado" : "Incompleto"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Consolidado de todas las corrientes · {etiquetaMesTitulo(reporte.mesEvaluado)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-2xl font-semibold">{formatearKg(reporte.totalesMensuales.kilogramosTotales)}</p>
              <p className="text-sm text-muted-foreground">
                De ese total, {formatearKg(reporte.totalesMensuales.kilogramosPeligrosos)} corresponde a residuos peligrosos.
                Las categorías históricas «Químico» se mantienen sin inferir su característica.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corriente</TableHead>
                    <TableHead className="text-right">Peso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reporte.totalesMensuales.porCorriente.map(({ corriente, kilogramos }) => (
                    <TableRow key={corriente}>
                      <TableCell>{ETIQUETAS_CORRIENTE[corriente]}</TableCell>
                      <TableCell className="text-right">{formatearKg(kilogramos)}</TableCell>
                    </TableRow>
                  ))}
                  {reporte.totalesMensuales.porCorriente.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Sin pesajes registrados.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Ver detalle por categoría</summary>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Corriente</TableHead>
                      <TableHead className="text-right">Peso</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporte.totalesMensuales.porTipo.map((total) => (
                      <TableRow key={total.tipo}>
                        <TableCell>{total.etiqueta}</TableCell>
                        <TableCell>{ETIQUETAS_CORRIENTE[total.corriente]}</TableCell>
                        <TableCell className="text-right">{formatearKg(total.kilogramos)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            </CardContent>
          </Card>

          {reporte.confirmaciones.length ? (
            <Card>
              <CardHeader><CardTitle className="text-base font-medium">Historial de declaraciones de cero</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Motivo de corrección</TableHead>
                      {puedeEditar ? (
                        <TableHead>
                          <span className="sr-only">Acciones</span>
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporte.confirmaciones.map((declaracion) => (
                      <TableRow key={declaracion.id}>
                        <TableCell className="capitalize">{etiquetaMes(declaracion.mes)}</TableCell>
                        <TableCell>
                          <Badge variant={declaracion.revocadaEn ? "secondary" : "outline"}>
                            {declaracion.revocadaEn ? "Revocada" : "Vigente"}
                          </Badge>
                        </TableCell>
                        <TableCell>{declaracion.motivoRevocacion ?? "—"}</TableCell>
                        {puedeEditar ? (
                          <TableCell>
                            {!declaracion.revocadaEn ? (
                              <RevocarCeroDialog declaracionId={declaracion.id} onRevocado={buscar} />
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RevocarCeroDialog({ declaracionId, onRevocado }: { declaracionId: string; onRevocado: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(revocarCeroResiduo, null);
  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    onRevocado();
    toast.add({ title: "Declaración corregida", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="icon-sm" aria-label="Corregir declaración" title="Corregir declaración">
            <PencilIcon />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader><DialogTitle>Revocar confirmación de cero</DialogTitle></DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={declaracionId} />
          {state?.error ? (
            <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={`motivo-${declaracionId}`}>Motivo de corrección</Label>
            <Textarea id={`motivo-${declaracionId}`} name="motivo" minLength={5} maxLength={500} required rows={3} />
          </div>
          <Button type="submit" variant="destructive" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Revocar confirmación"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
