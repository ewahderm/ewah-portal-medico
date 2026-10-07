"use client";

import { useEffect, useState, useTransition } from "react";
import { PlusIcon, DownloadIcon } from "lucide-react";
import { registrarCambioCargo, registrarCambioSalario, listarHistorialEmpleado } from "@/lib/rrhh/historial";
import { urlFirmadaDocumentoRrhh } from "@/lib/rrhh/documentos";
import { formatoMoneda } from "@/lib/format";
import { TIPOS_SALARIO } from "@/lib/rrhh/constantes";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/ui/file-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { toItems, type Opcion } from "@/lib/forms/opciones";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exigirExito } from "@/lib/forms/resultado";

function CambioCargoDialog({ empleadoId, cargos, onCreado }: { empleadoId: string; cargos: Opcion[]; onCreado: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGuardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        exigirExito(await registrarCambioCargo(empleadoId, formData));
        onCreado();
        toast.add({ title: "Cambio de cargo registrado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo registrar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm"><PlusIcon /> Cambio de cargo</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar cambio de cargo</DialogTitle></DialogHeader>
        <form action={handleGuardar} className="space-y-4">
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <div className="space-y-2">
            <Label htmlFor="cargoId">Cargo</Label>
            <Combobox id="cargoId" name="cargoId" items={toItems(cargos)} required placeholder="Buscar cargo..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fechaInicio">Fecha de inicio</Label>
            <Input id="fechaInicio" name="fechaInicio" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="acta" className="font-semibold">Acta (opcional)</Label>
            <FileInput id="acta" name="acta" accept="application/pdf,image/jpeg,image/png" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Guardando..." : "Guardar"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CambioSalarioDialog({ empleadoId, onCreado }: { empleadoId: string; onCreado: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGuardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        exigirExito(await registrarCambioSalario(empleadoId, formData));
        onCreado();
        toast.add({ title: "Cambio de salario registrado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo registrar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm"><PlusIcon /> Cambio de salario</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar cambio de salario</DialogTitle></DialogHeader>
        <form action={handleGuardar} className="space-y-4">
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <div className="space-y-2">
            <Label htmlFor="salario">Salario / valor pactado</Label>
            <Input id="salario" name="salario" type="number" min="0" step="1000" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tipoSalario">Tipo de salario</Label>
            <Combobox id="tipoSalario" name="tipoSalario" items={[...TIPOS_SALARIO]} defaultValue="ordinario" />
            <p className="text-xs text-muted-foreground">
              Integral (CST art. 132): mínimo 13 salarios mínimos. Incluye prima, cesantías e intereses —
              no se liquidan aparte — y los aportes se calculan sobre el 70%.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fechaInicio">Fecha de inicio</Label>
            <Input id="fechaInicio" name="fechaInicio" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="acta" className="font-semibold">Acta (opcional)</Label>
            <FileInput id="acta" name="acta" accept="application/pdf,image/jpeg,image/png" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Guardando..." : "Guardar"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HistorialTab({ empleadoId, cargos, puedeCrear }: { empleadoId: string; cargos: Opcion[]; puedeCrear: boolean }) {
  const [historial, setHistorial] = useState<Awaited<ReturnType<typeof listarHistorialEmpleado>>>({ cargos: [], salarios: [] });
  const [, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      const data = await listarHistorialEmpleado(empleadoId);
      setHistorial(data);
    });
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function descargar(path: string) {
    const resultado = await urlFirmadaDocumentoRrhh(path);
    if ("error" in resultado) {
      toast.add({ title: resultado.error, type: "error" });
      return;
    }
    window.open(resultado.url, "_blank");
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">Historial de cargo</CardTitle>
          {puedeCrear ? <CambioCargoDialog empleadoId={empleadoId} cargos={cargos} onCreado={cargar} /> : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Desde</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead className="text-right">Acta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.cargos.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="text-muted-foreground">{h.fecha_inicio}</TableCell>
                  <TableCell className="font-medium">{(h.cargos as unknown as { nombre: string } | null)?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {h.acta_storage_path ? (
                      <Button variant="ghost" size="sm" onClick={() => descargar(h.acta_storage_path!)}>
                        <DownloadIcon />
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {historial.cargos.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sin registros.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">Historial de salario</CardTitle>
          {puedeCrear ? <CambioSalarioDialog empleadoId={empleadoId} onCreado={cargar} /> : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Desde</TableHead>
                <TableHead>Salario</TableHead>
                <TableHead className="text-right">Acta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.salarios.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="text-muted-foreground">{h.fecha_inicio}</TableCell>
                  <TableCell className="font-medium">
                    {formatoMoneda(h.salario)}
                    {h.tipo_salario === "integral" ? (
                      <Badge variant="outline" className="ml-2">Integral</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {h.acta_storage_path ? (
                      <Button variant="ghost" size="sm" onClick={() => descargar(h.acta_storage_path!)}>
                        <DownloadIcon />
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {historial.salarios.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sin registros.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
