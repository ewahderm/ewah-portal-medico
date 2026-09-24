"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import jsQR from "jsqr";
import { CameraIcon, PackageSearchIcon, XIcon } from "lucide-react";
import { buscarLotePorId } from "@/lib/inventario/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type LoteEscaneado = NonNullable<Awaited<ReturnType<typeof buscarLotePorId>>>;

/**
 * Input siempre listo para recibir el "tecleo + Enter" de una pistola láser,
 * más un lector de cámara (getUserMedia + jsqr) para celular — ambos caminos
 * terminan en la misma búsqueda por id de lote. Compartido entre la pantalla
 * de escaneo general (/inventario/escanear) y el registro de consumo de un
 * tratamiento (InsumosDialog) para no duplicar esta lógica en dos lugares.
 */
export function LoteScanner({
  onEncontrado,
  sedeIdEsperada,
  autoFocus = true,
}: {
  onEncontrado: (lote: LoteEscaneado) => void;
  /** Si se indica, un lote de otra sede se rechaza con un error claro en
   * vez de dejarlo pasar — el escaneo se salta el filtro por sede que un
   * combobox manual ya aplica al solo listar lotes de la sede correcta. */
  sedeIdEsperada?: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animacionRef = useRef<number | null>(null);

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

  useEffect(() => () => detenerCamara(), []);

  function buscar(codigo: string) {
    const id = codigo.trim();
    if (!id) return;
    setErrorBusqueda(null);
    startBusqueda(async () => {
      try {
        const data = await buscarLotePorId(id);
        if (!data) {
          setErrorBusqueda("No se encontró ningún lote con ese código.");
          return;
        }
        if (sedeIdEsperada && data.sede_id !== sedeIdEsperada) {
          setErrorBusqueda(
            `Ese insumo pertenece a otra sede (${data.sedes?.nombre ?? "desconocida"}) — no se puede usar aquí.`,
          );
          return;
        }
        onEncontrado(data);
      } catch (e) {
        setErrorBusqueda(e instanceof Error ? e.message : "No se pudo buscar el lote.");
      } finally {
        inputRef.current?.focus();
      }
    });
  }

  // Sin <form> propio a propósito: este componente se usa tanto solo
  // (pantalla de escaneo) como embebido DENTRO de otro <form> (registrar
  // consumo en un tratamiento) — un <form> anidado es HTML inválido y
  // React lo marca como error de hidratación. El Enter de la pistola
  // láser se captura a mano y se frena aquí (preventDefault) para que no
  // burbujee y dispare el submit del formulario contenedor.
  function buscarDesdeInput() {
    const valor = inputRef.current?.value ?? "";
    buscar(valor);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleKeyDownCodigo(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      buscarDesdeInput();
    }
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

    // getUserMedia solo existe en un "contexto seguro" (https://, o
    // localhost) — si alguien entra por http:// a una IP de red local (ej.
    // celular apuntando al computador del consultorio por wifi), el
    // navegador ni siquiera expone la API, y el error genérico de más
    // abajo no explicaría por qué. Detectarlo aparte da un mensaje que sí
    // sirve para diagnosticarlo.
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorCamara(
        "Este navegador no permite usar la cámara aquí — solo funciona entrando por https:// (o localhost). Usa el lector físico mientras tanto.",
      );
      return;
    }

    try {
      // {ideal: "environment"} en vez del string suelto: es una preferencia
      // (la cámara trasera si existe), nunca un requisito que pueda
      // rechazar la petición completa en un equipo sin cámara trasera
      // (una laptop, por ejemplo).
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setCamaraActiva(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      animacionRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const nombre = e instanceof Error ? e.name : "";
      const mensaje =
        nombre === "NotAllowedError"
          ? "El navegador bloqueó el acceso a la cámara — revisa los permisos del sitio (ícono de candado en la barra de direcciones) y vuelve a intentar."
          : nombre === "NotFoundError"
            ? "No se encontró ninguna cámara en este dispositivo."
            : "No se pudo acceder a la cámara — revisa los permisos del navegador o usa el lector físico.";
      setErrorCamara(mensaje);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Apunta la pistola láser o la cámara al QR de la etiqueta impresa del lote (Inventario →
        botón &quot;Etiqueta&quot;). No es un código que se sepa de memoria — este campo solo sirve
        escaneando o con la cámara.
      </p>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          autoFocus={autoFocus}
          onKeyDown={handleKeyDownCodigo}
          placeholder="Esperando el escaneo de la pistola..."
          className="flex-1"
        />
        <Button type="button" size="sm" disabled={pendingBusqueda} onClick={buscarDesdeInput}>
          <PackageSearchIcon /> Buscar
        </Button>
        {camaraActiva ? (
          <Button type="button" variant="outline" size="sm" onClick={detenerCamara}>
            <XIcon /> Cancelar
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={iniciarCamara}>
            <CameraIcon /> Cámara
          </Button>
        )}
      </div>

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
    </div>
  );
}
