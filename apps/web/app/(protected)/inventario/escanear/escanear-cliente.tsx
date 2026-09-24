"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import jsQR from "jsqr";
import { CameraIcon, PackageSearchIcon, XIcon } from "lucide-react";
import { buscarLotePorId, registrarMovimiento } from "@/lib/inventario/actions";
import { MOTIVOS_ENTRADA, MOTIVOS_SALIDA, MOTIVO_LABEL } from "@/lib/inventario/motivos";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";

type Lote = {
  id: string;
  numero_lote: string | null;
  fecha_vencimiento: string | null;
  cantidad_actual: number;
  activo: boolean;
  insumo_id: string;
  sede_id: string;
  insumos: { nombre: string; unidad_medida: string } | null;
  sedes: { nombre: string } | null;
};

const ITEMS_MOTIVO = [
  ...MOTIVOS_ENTRADA.map((m) => ({ value: m, label: `Ingreso — ${MOTIVO_LABEL[m]}` })),
  ...MOTIVOS_SALIDA.map((m) => ({ value: m, label: `Salida — ${MOTIVO_LABEL[m]}` })),
];

export function EscanearCliente({ puedeRegistrar }: { puedeRegistrar: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animacionRef = useRef<number | null>(null);

  const [lote, setLote] = useState<Lote | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [pendingBusqueda, startBusqueda] = useTransition();
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);

  function detenerCamara() {
    if (animacionRef.current) cancelAnimationFrame(animacionRef.current);
    animacionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamaraActiva(false);
  }

  // Nunca dejar la cámara prendida si la persona navega a otra pantalla
  // sin apagarla explícitamente.
  useEffect(() => () => detenerCamara(), []);

  function buscar(codigo: string) {
    const id = codigo.trim();
    if (!id) return;
    setErrorBusqueda(null);
    startBusqueda(async () => {
      try {
        const data = await buscarLotePorId(id);
        if (!data) {
          setLote(null);
          setErrorBusqueda("No se encontró ningún lote con ese código.");
          return;
        }
        setLote(data as unknown as Lote);
      } catch (e) {
        setLote(null);
        setErrorBusqueda(e instanceof Error ? e.message : "No se pudo buscar el lote.");
      } finally {
        inputRef.current?.focus();
      }
    });
  }

  function handleSubmitCodigo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const valor = inputRef.current?.value ?? "";
    buscar(valor);
    if (inputRef.current) inputRef.current.value = "";
  }

  function tick() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!streamRef.current || !video || !canvas) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const codigo = jsQR(imagen.data, imagen.width, imagen.height);
        if (codigo) {
          detenerCamara();
          buscar(codigo.data);
          return;
        }
      }
    }
    animacionRef.current = requestAnimationFrame(tick);
  }

  async function iniciarCamara() {
    setErrorCamara(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCamaraActiva(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      animacionRef.current = requestAnimationFrame(tick);
    } catch {
      setErrorCamara(
        "No se pudo acceder a la cámara — revisa los permisos del navegador o usa el lector físico.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Escanear código</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmitCodigo} className="flex items-center gap-2">
            <Input
              ref={inputRef}
              autoFocus
              placeholder="Escanea con la pistola o pega el código aquí..."
              className="flex-1"
            />
            <Button type="submit" disabled={pendingBusqueda}>
              <PackageSearchIcon /> Buscar
            </Button>
            {camaraActiva ? (
              <Button type="button" variant="outline" onClick={detenerCamara}>
                <XIcon /> Cancelar cámara
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={iniciarCamara}>
                <CameraIcon /> Usar cámara
              </Button>
            )}
          </form>

          {errorCamara ? (
            <Alert variant="destructive">
              <AlertDescription>{errorCamara}</AlertDescription>
            </Alert>
          ) : null}

          {camaraActiva ? (
            <div className="relative mx-auto max-w-sm overflow-hidden rounded-lg border">
              <video ref={videoRef} className="w-full" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />
            </div>
          ) : null}

          {errorBusqueda ? (
            <Alert variant="destructive">
              <AlertDescription>{errorBusqueda}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {lote ? (
        <LoteEncontrado
          lote={lote}
          puedeRegistrar={puedeRegistrar}
          onActualizado={() => buscar(lote.id)}
        />
      ) : null}
    </div>
  );
}

function LoteEncontrado({
  lote,
  puedeRegistrar,
  onActualizado,
}: {
  lote: Lote;
  puedeRegistrar: boolean;
  onActualizado: () => void;
}) {
  const [state, formAction, pending] = useActionState(registrarMovimiento, null);

  useCerrarAlExito(pending, !state?.error, () => {
    toast.add({ title: "Movimiento registrado", type: "success" });
    onActualizado();
  });

  return (
    <Card className="border-primary">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{lote.insumos?.nombre ?? "—"}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Lote: {lote.numero_lote ?? "—"} · {lote.sedes?.nombre ?? "—"}
          </p>
        </div>
        {!lote.activo ? <Badge variant="outline">Inactivo</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Stock actual</p>
            <p className={`font-medium ${lote.cantidad_actual < 0 ? "text-destructive" : ""}`}>
              {lote.cantidad_actual} {lote.insumos?.unidad_medida ?? ""}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Vencimiento</p>
            <p className="font-medium">{lote.fecha_vencimiento ?? "—"}</p>
          </div>
        </div>

        {puedeRegistrar ? (
          <form action={formAction} className="space-y-3 border-t pt-4">
            <input type="hidden" name="loteId" value={lote.id} />
            {state?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
            {state?.warning ? (
              <Alert>
                <AlertDescription>Registrado, pero: {state.warning}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="motivoMovimientoEscaneo">Tipo de movimiento</Label>
                <Combobox
                  id="motivoMovimientoEscaneo"
                  name="motivoMovimiento"
                  required
                  items={ITEMS_MOTIVO}
                  placeholder="Selecciona..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cantidadEscaneo">Cantidad</Label>
                <Input
                  id="cantidadEscaneo"
                  name="cantidad"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacionesEscaneo">Observaciones (opcional)</Label>
              <Textarea id="observacionesEscaneo" name="observaciones" rows={2} />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Registrando..." : "Registrar movimiento"}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
