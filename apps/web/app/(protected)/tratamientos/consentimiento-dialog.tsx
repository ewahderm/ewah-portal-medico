"use client";

import { useRef, useState, useTransition } from "react";
import { PDFDocument } from "pdf-lib";
import {
  FileSignatureIcon,
  CameraIcon,
  UploadIcon,
  XIcon,
  DownloadIcon,
  CheckIcon,
  RotateCcwIcon,
} from "lucide-react";
import {
  listarConsentimientosTratamiento,
  subirConsentimientoTratamiento,
  eliminarConsentimientoTratamiento,
} from "@/lib/tratamientos/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { exigirExito } from "@/lib/forms/resultado";

type Consentimiento = {
  id: string;
  storage_path: string;
  nombre_archivo: string;
  paginas: number;
  created_at: string;
  url: string | null;
};

// Rectángulo de recorte en porcentaje del tamaño mostrado de la imagen
// (0-100), nunca en píxeles de pantalla — así no hace falta medir el
// elemento <img> para convertir coordenadas de arrastre, solo para
// calcular el recorte final contra el tamaño natural de la imagen.
type Recorte = { left: number; top: number; right: number; bottom: number };
type Esquina = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const MARGEN_MIN = 4; // % mínimo entre bordes opuestos, evita colapsar el recorte a un punto

function recorteInicial(): Recorte {
  return { left: 5, top: 5, right: 95, bottom: 95 };
}

export function ConsentimientoDialog({
  tratamientoId,
  tieneConsentimiento,
}: {
  tratamientoId: string;
  tieneConsentimiento: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [vista, setVista] = useState<"lista" | "camara" | "recorte">("lista");
  const [consentimientos, setConsentimientos] = useState<Consentimiento[]>([]);
  const [paginas, setPaginas] = useState<Blob[]>([]);
  const [fotoCapturada, setFotoCapturada] = useState<HTMLImageElement | null>(null);
  const [recorte, setRecorte] = useState<Recorte>(recorteInicial());
  const [error, setError] = useState<string | null>(null);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imagenContainerRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<Esquina | null>(null);
  const archivoInputRef = useRef<HTMLInputElement>(null);

  function cargar() {
    startTransition(async () => {
      const data = await listarConsentimientosTratamiento(tratamientoId);
      setConsentimientos(data as Consentimiento[]);
    });
  }

  function detenerCamara() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function reiniciarFlujo() {
    detenerCamara();
    setFotoCapturada(null);
    setRecorte(recorteInicial());
    setErrorCamara(null);
    setVista("lista");
  }

  async function iniciarCamara() {
    setErrorCamara(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorCamara(
        "Este navegador no permite usar la cámara aquí — solo funciona entrando por https:// (o localhost).",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setVista("camara");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      const nombre = e instanceof Error ? e.name : "";
      setErrorCamara(
        nombre === "NotAllowedError"
          ? "El navegador bloqueó el acceso a la cámara — revisa los permisos del sitio."
          : nombre === "NotFoundError"
            ? "No se encontró ninguna cámara en este dispositivo."
            : "No se pudo acceder a la cámara.",
      );
    }
  }

  function tomarFoto() {
    const video = videoRef.current;
    if (!video || video.readyState < video.HAVE_CURRENT_DATA) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    detenerCamara();

    const img = new Image();
    img.onload = () => {
      setFotoCapturada(img);
      setRecorte(recorteInicial());
      setVista("recorte");
    };
    img.src = canvas.toDataURL("image/jpeg", 0.92);
  }

  // Cada esquina solo mueve sus dos bordes adyacentes — el recorte nunca
  // deja de ser un rectángulo alineado a los ejes (sin corrección de
  // perspectiva tipo escáner, decisión acordada con el usuario).
  function iniciarArrastre(esquina: Esquina) {
    arrastreRef.current = esquina;
    window.addEventListener("pointermove", moverArrastre);
    window.addEventListener("pointerup", terminarArrastre);
  }

  function moverArrastre(e: PointerEvent) {
    const esquina = arrastreRef.current;
    const contenedor = imagenContainerRef.current;
    if (!esquina || !contenedor) return;
    const rect = contenedor.getBoundingClientRect();
    const xPct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));

    setRecorte((anterior) => {
      const siguiente = { ...anterior };
      if (esquina === "top-left") {
        siguiente.left = Math.min(xPct, anterior.right - MARGEN_MIN);
        siguiente.top = Math.min(yPct, anterior.bottom - MARGEN_MIN);
      } else if (esquina === "top-right") {
        siguiente.right = Math.max(xPct, anterior.left + MARGEN_MIN);
        siguiente.top = Math.min(yPct, anterior.bottom - MARGEN_MIN);
      } else if (esquina === "bottom-left") {
        siguiente.left = Math.min(xPct, anterior.right - MARGEN_MIN);
        siguiente.bottom = Math.max(yPct, anterior.top + MARGEN_MIN);
      } else {
        siguiente.right = Math.max(xPct, anterior.left + MARGEN_MIN);
        siguiente.bottom = Math.max(yPct, anterior.top + MARGEN_MIN);
      }
      return siguiente;
    });
  }

  function terminarArrastre() {
    arrastreRef.current = null;
    window.removeEventListener("pointermove", moverArrastre);
    window.removeEventListener("pointerup", terminarArrastre);
  }

  function confirmarPagina() {
    const img = fotoCapturada;
    if (!img) return;
    const sx = (recorte.left / 100) * img.naturalWidth;
    const sy = (recorte.top / 100) * img.naturalHeight;
    const sw = ((recorte.right - recorte.left) / 100) * img.naturalWidth;
    const sh = ((recorte.bottom - recorte.top) / 100) * img.naturalHeight;

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    canvas.toBlob(
      (blob) => {
        if (blob) setPaginas((actual) => [...actual, blob]);
        setFotoCapturada(null);
        setVista("lista");
      },
      "image/jpeg",
      0.9,
    );
  }

  async function construirPdf(hojas: Blob[]): Promise<Blob> {
    const pdf = await PDFDocument.create();
    for (const hoja of hojas) {
      const bytes = new Uint8Array(await hoja.arrayBuffer());
      const imagen = await pdf.embedJpg(bytes);
      const pagina = pdf.addPage([imagen.width, imagen.height]);
      pagina.drawImage(imagen, { x: 0, y: 0, width: imagen.width, height: imagen.height });
    }
    const bytes = await pdf.save();
    return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  }

  function guardarConsentimiento() {
    if (paginas.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const pdfBlob = await construirPdf(paginas);
        const formData = new FormData();
        formData.set("archivo", new File([pdfBlob], "consentimiento.pdf", { type: "application/pdf" }));
        formData.set("paginas", String(paginas.length));
        exigirExito(await subirConsentimientoTratamiento(tratamientoId, formData));
        setPaginas([]);
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar el consentimiento.");
      }
    });
  }

  async function construirPdfDesdeImagen(archivo: File): Promise<Blob> {
    const pdf = await PDFDocument.create();
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const imagen = archivo.type === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const pagina = pdf.addPage([imagen.width, imagen.height]);
    pagina.drawImage(imagen, { x: 0, y: 0, width: imagen.width, height: imagen.height });
    const bytesFinal = await pdf.save();
    return new Blob([new Uint8Array(bytesFinal)], { type: "application/pdf" });
  }

  function subirArchivoSeleccionado(archivo: File) {
    setError(null);
    startTransition(async () => {
      try {
        let pdfBlob: Blob;
        let nombreArchivo = archivo.name;
        let totalPaginas: number;
        if (archivo.type === "application/pdf") {
          pdfBlob = archivo;
          const bytes = new Uint8Array(await archivo.arrayBuffer());
          const pdf = await PDFDocument.load(bytes);
          totalPaginas = pdf.getPageCount();
        } else if (archivo.type === "image/jpeg" || archivo.type === "image/png") {
          pdfBlob = await construirPdfDesdeImagen(archivo);
          nombreArchivo = "consentimiento.pdf";
          totalPaginas = 1;
        } else {
          throw new Error("Formato no soportado — sube un PDF, JPG o PNG.");
        }
        const formData = new FormData();
        formData.set("archivo", new File([pdfBlob], nombreArchivo, { type: "application/pdf" }));
        formData.set("paginas", String(totalPaginas));
        exigirExito(await subirConsentimientoTratamiento(tratamientoId, formData));
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir el archivo.");
      } finally {
        if (archivoInputRef.current) archivoInputRef.current.value = "";
      }
    });
  }

  function eliminar(id: string, storagePath: string) {
    setError(null);
    startTransition(async () => {
      try {
        exigirExito(await eliminarConsentimientoTratamiento(id, storagePath));
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo eliminar.");
      }
    });
  }

  const anchoRecorte = recorte.right - recorte.left;
  const altoRecorte = recorte.bottom - recorte.top;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reiniciarFlujo();
          setPaginas([]);
          setError(null);
        }
        setOpen(next);
        if (next) cargar();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="relative" aria-label="Consentimiento">
            <FileSignatureIcon className="md:hidden" />
            <span className="hidden md:inline">Consentimiento</span>
            {tieneConsentimiento ? (
              <>
                <span
                  aria-hidden
                  title="Ya tiene consentimiento"
                  className="absolute -top-1 -right-1 size-2 rounded-full bg-primary"
                />
                <span className="sr-only"> (ya tiene consentimiento)</span>
              </>
            ) : null}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Consentimiento informado</DialogTitle>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {vista === "lista" ? (
          <div className="space-y-4">
            {paginas.length > 0 ? (
              <Alert>
                <AlertDescription>
                  {paginas.length} página{paginas.length === 1 ? "" : "s"} capturada
                  {paginas.length === 1 ? "" : "s"} — sin guardar todavía.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              {consentimientos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay ningún consentimiento guardado para este tratamiento.
                </p>
              ) : (
                consentimientos.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.nombre_archivo}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("es-CO")} · {c.paginas} página
                        {c.paginas === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {c.url ? (
                        <Button
                          variant="outline"
                          size="icon-sm"
                          nativeButton={false}
                          render={<a href={c.url} target="_blank" rel="noreferrer" />}
                        >
                          <DownloadIcon />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        onClick={() => eliminar(c.id, c.storage_path)}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="flex-1" onClick={iniciarCamara}>
                <CameraIcon /> {paginas.length > 0 ? "Agregar otra página" : "Tomar foto"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={pending}
                onClick={() => archivoInputRef.current?.click()}
              >
                <UploadIcon /> Subir archivo
              </Button>
              {paginas.length > 0 ? (
                <Button type="button" className="flex-1" disabled={pending} onClick={guardarConsentimiento}>
                  {pending ? "Guardando..." : "Terminar y guardar"}
                </Button>
              ) : null}
            </div>
            <input
              ref={archivoInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) subirArchivoSeleccionado(archivo);
              }}
            />
          </div>
        ) : null}

        {/* Montado siempre (nunca condicionado a vista==="camara") y solo
            oculto por CSS — mismo motivo que en lote-scanner.tsx: si el
            <video> se monta/desmonta con el estado, videoRef.current sigue
            siendo null en el mismo tick síncrono en que iniciarCamara()
            intenta asignarle el stream, porque React todavía no
            re-renderizó. Mantenerlo siempre en el DOM evita esa carrera. */}
        <div className={vista === "camara" ? "space-y-3" : "hidden"}>
          {errorCamara ? (
            <Alert variant="destructive">
              <AlertDescription>{errorCamara}</AlertDescription>
            </Alert>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Encuadra la hoja completa del consentimiento firmado y toma la foto.
          </p>
          <div className="relative mx-auto max-w-sm overflow-hidden rounded-lg border">
            <video ref={videoRef} className="w-full" muted playsInline />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={reiniciarFlujo}>
              Cancelar
            </Button>
            <Button type="button" className="flex-1" onClick={tomarFoto}>
              <CameraIcon /> Tomar foto
            </Button>
          </div>
        </div>

        {vista === "recorte" && fotoCapturada ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ajusta las 4 esquinas para que el recorte cubra solo la hoja.
            </p>
            <div
              ref={imagenContainerRef}
              className="relative mx-auto max-w-sm touch-none select-none overflow-hidden rounded-lg border"
            >
              <img src={fotoCapturada.src} alt="Página capturada" className="block w-full" draggable={false} />
              {/* Zonas oscurecidas fuera del recorte */}
              <div
                className="absolute inset-x-0 top-0 bg-black/50"
                style={{ height: `${recorte.top}%` }}
              />
              <div
                className="absolute inset-x-0 bottom-0 bg-black/50"
                style={{ height: `${100 - recorte.bottom}%` }}
              />
              <div
                className="absolute bg-black/50"
                style={{ left: 0, top: `${recorte.top}%`, width: `${recorte.left}%`, height: `${altoRecorte}%` }}
              />
              <div
                className="absolute bg-black/50"
                style={{ right: 0, top: `${recorte.top}%`, width: `${100 - recorte.right}%`, height: `${altoRecorte}%` }}
              />
              {/* Marco del recorte */}
              <div
                className="pointer-events-none absolute border-2 border-primary"
                style={{
                  left: `${recorte.left}%`,
                  top: `${recorte.top}%`,
                  width: `${anchoRecorte}%`,
                  height: `${altoRecorte}%`,
                }}
              />
              {(
                [
                  ["top-left", recorte.left, recorte.top],
                  ["top-right", recorte.right, recorte.top],
                  ["bottom-left", recorte.left, recorte.bottom],
                  ["bottom-right", recorte.right, recorte.bottom],
                ] as [Esquina, number, number][]
              ).map(([esquina, x, y]) => (
                <div
                  key={esquina}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    iniciarArrastre(esquina);
                  }}
                  className="absolute size-5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-primary bg-background shadow"
                  style={{ left: `${x}%`, top: `${y}%` }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setFotoCapturada(null);
                  iniciarCamara();
                }}
              >
                <RotateCcwIcon /> Repetir foto
              </Button>
              <Button type="button" className="flex-1" onClick={confirmarPagina}>
                <CheckIcon /> Confirmar página
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
