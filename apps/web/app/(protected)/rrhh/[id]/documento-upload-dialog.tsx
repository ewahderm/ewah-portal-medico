"use client";

import { useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";
import { subirDocumentoEmpleado } from "@/lib/rrhh/documentos";
import { TIPOS_DOCUMENTO_EMPLEADO } from "@/lib/rrhh/constantes";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { toItems, type Opcion } from "@/lib/forms/opciones";

export function DocumentoUploadDialog({
  empleadoId,
  tiposVacuna,
  tiposExamen,
  onSubido,
}: {
  empleadoId: string;
  tiposVacuna: Opcion[];
  tiposExamen: Opcion[];
  onSubido: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tipo, setTipo] = useState<string>(TIPOS_DOCUMENTO_EMPLEADO[0].value);

  function handleSubir(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await subirDocumentoEmpleado(empleadoId, formData);
        onSubido();
        toast.add({ title: "Documento guardado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir el documento.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon /> Agregar documento
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo documento</DialogTitle>
        </DialogHeader>
        <form action={handleSubir} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo de documento</Label>
            <Combobox
              id="tipo"
              name="tipo"
              items={[...TIPOS_DOCUMENTO_EMPLEADO]}
              value={tipo}
              onValueChange={(v) => setTipo(String(v))}
              required
            />
          </div>

          {tipo === "vacuna" ? (
            <div className="space-y-2">
              <Label htmlFor="tipoVacunaId">Vacuna</Label>
              <Combobox id="tipoVacunaId" name="tipoVacunaId" items={toItems(tiposVacuna)} required placeholder="Buscar vacuna..." />
            </div>
          ) : null}

          {tipo === "examen_ocupacional" ? (
            <div className="space-y-2">
              <Label htmlFor="tipoExamenId">Tipo de examen</Label>
              <Combobox id="tipoExamenId" name="tipoExamenId" items={toItems(tiposExamen)} required />
            </div>
          ) : null}

          {tipo === "acta_diploma" || tipo === "otro_certificado" ? (
            <div className="space-y-2">
              <Label htmlFor="nombrePersonalizado">Nombre del documento</Label>
              <Input id="nombrePersonalizado" name="nombrePersonalizado" required />
            </div>
          ) : null}

          {tipo === "vacuna" || tipo === "examen_ocupacional" || tipo === "acta_diploma" ? (
            <div className="space-y-2">
              <Label htmlFor="fechaEvento">
                {tipo === "acta_diploma" ? "Fecha de emisión" : "Fecha"}
              </Label>
              <Input id="fechaEvento" name="fechaEvento" type="date" />
            </div>
          ) : null}

          {tipo === "vacuna" ? (
            <div className="space-y-2">
              <Label htmlFor="fechaVencimiento">Fecha de caducidad (opcional)</Label>
              <Input id="fechaVencimiento" name="fechaVencimiento" type="date" />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="archivo">Archivo</Label>
            <input id="archivo" name="archivo" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="text-sm" />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Subiendo..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
