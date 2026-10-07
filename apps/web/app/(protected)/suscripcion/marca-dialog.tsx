"use client";

import { useRef, useState, useTransition, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageIcon } from "lucide-react";
import { actualizarMarcaClinica, subirLogoClinica } from "@/lib/clinicas/actions";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/ui/file-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function MarcaDialog({
  trigger,
  nombreComercial,
  correoNotificaciones,
  telefonoContacto,
  logoUrl,
}: {
  trigger: ReactElement;
  nombreComercial: string | null;
  correoNotificaciones: string | null;
  telefonoContacto: string | null;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDatos, startDatosTransition] = useTransition();
  const [pendingLogo, startLogoTransition] = useTransition();
  const [previewLogo, setPreviewLogo] = useState<string | null>(null);
  const inputLogoRef = useRef<HTMLInputElement>(null);

  // Llamar a una server action envuelta en una función intermedia (en vez de
  // pasarla directo como `action` de un <form>) no dispara el refresco
  // automático de Next.js — hay que pedirlo a mano, igual que en
  // EstadoAcciones (ver atencion_entidad_module.md).
  function handleGuardarDatos(formData: FormData) {
    setError(null);
    startDatosTransition(async () => {
      try {
        await actualizarMarcaClinica(formData);
        router.refresh();
        toast.add({ title: "Marca actualizada", type: "success" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar la marca.");
      }
    });
  }

  function handleSeleccionarLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    setPreviewLogo(archivo ? URL.createObjectURL(archivo) : null);
  }

  function handleSubirLogo(formData: FormData) {
    setError(null);
    startLogoTransition(async () => {
      try {
        await subirLogoClinica(formData);
        router.refresh();
        setPreviewLogo(null);
        if (inputLogoRef.current) inputLogoRef.current.value = "";
        toast.add({ title: "Logo actualizado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir el logo.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marca y notificaciones</DialogTitle>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-3 border-b pb-4">
          <Label htmlFor="logo" className="font-semibold">Logo de la clínica</Label>
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {previewLogo || logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewLogo ?? logoUrl ?? undefined}
                  alt="Logo de la clínica"
                  className="size-full object-contain"
                />
              ) : (
                <ImageIcon className="size-6 text-muted-foreground" />
              )}
            </div>
            <form action={handleSubirLogo} className="flex flex-1 items-center gap-2">
              <FileInput
                ref={inputLogoRef}
                id="logo"
                name="logo"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleSeleccionarLogo}
                className="flex-1"
                required
              />
              <Button type="submit" size="sm" variant="outline" disabled={pendingLogo}>
                {pendingLogo ? "Subiendo..." : "Subir"}
              </Button>
            </form>
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPEG, WebP o SVG. Máximo 2MB.</p>
        </div>

        <form action={handleGuardarDatos} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {nombreComercial ? (
              <>
                Tus pacientes te ven como <span className="font-medium text-foreground">{nombreComercial}</span>.{" "}
              </>
            ) : null}
            El nombre comercial se configura en{" "}
            <Link href="/parametros" className="text-primary underline underline-offset-4">
              Parámetros &gt; Datos básicos
            </Link>
            .
          </p>
          <div className="space-y-2">
            <Label htmlFor="correoNotificaciones">Correo de notificaciones</Label>
            <Input
              id="correoNotificaciones"
              name="correoNotificaciones"
              type="email"
              defaultValue={correoNotificaciones ?? ""}
              placeholder="contacto@tuclinica.com"
            />
            <p className="text-xs text-muted-foreground">
              Los correos a tus pacientes siguen saliendo desde EWAH — si un paciente responde, la
              respuesta llega a este correo.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefonoContacto">Teléfono de contacto</Label>
            <Input
              id="telefonoContacto"
              name="telefonoContacto"
              defaultValue={telefonoContacto ?? ""}
              placeholder="300 123 4567"
            />
          </div>
          <Button type="submit" className="w-full" disabled={pendingDatos}>
            {pendingDatos ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
