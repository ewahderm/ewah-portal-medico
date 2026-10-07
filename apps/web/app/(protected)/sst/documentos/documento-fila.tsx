"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckIcon, CircleDashedIcon, DownloadIcon, UploadIcon } from "lucide-react";
import { registrarVersionSst, urlVersionSst } from "@/lib/sst/documentos";
import { subirArchivoSst } from "@/lib/sst/subida-cliente";
import type { VersionDocumentoSst } from "@/lib/sst/consultas";
import { ACCEPT_ARCHIVO } from "@/lib/habilitacion/constantes";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { abrirFirmado } from "../../habilitacion/_components/abrir-firmado";

export function DocumentoFila({
  tipoId,
  nombre,
  explicacion,
  aplica,
  recomendado,
  versiones,
  nombres,
  puedeCrear,
}: {
  tipoId: string;
  nombre: string;
  explicacion: string;
  aplica: boolean;
  recomendado: boolean;
  versiones: VersionDocumentoSst[];
  nombres: Record<string, string>;
  puedeCrear: boolean;
}) {
  const router = useRouter();
  const [verTodas, setVerTodas] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const vigente = versiones[0];

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSubiendo(true);
    try {
      const s = await subirArchivoSst(archivo, "documentos", tipoId);
      if ("error" in s) return toast.add({ title: "No se subió", description: s.error, type: "error" });
      const r = await registrarVersionSst({ tipoId, path: s.path, nombre: s.nombre });
      if (r.error) return toast.add({ title: "No se guardó", description: r.error, type: "error" });
      toast.add({ title: `${nombre}: versión ${(vigente?.version ?? 0) + 1} cargada`, type: "success" });
      router.refresh();
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        {vigente ? (
          <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-label="Cargado" />
        ) : (
          <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Falta" />
        )}
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {nombre}
            {!aplica ? <Badge variant="outline">No exigido para tu grupo</Badge> : null}
            {recomendado ? <Badge variant="outline">Recomendado en salud</Badge> : null}
          </p>
          <p className="text-xs text-muted-foreground">{explicacion}</p>
          {vigente ? (
            <div className="space-y-1 text-xs">
              {(verTodas ? versiones : [vigente]).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => abrirFirmado(() => urlVersionSst(v.id))}
                  className="flex items-center gap-1 text-left text-primary underline-offset-4 hover:underline"
                >
                  <DownloadIcon className="size-3.5 shrink-0" />
                  <span className="truncate">
                    v{v.version} · {v.nombre_archivo} · {fechaLegible(v.vigente_desde)}
                    {v.created_by && nombres[v.created_by] ? ` · ${nombres[v.created_by]}` : ""}
                  </span>
                </button>
              ))}
              {versiones.length > 1 ? (
                <button type="button" className="text-muted-foreground underline underline-offset-4" onClick={() => setVerTodas(!verTodas)}>
                  {verTodas ? "Ver solo la vigente" : `${versiones.length} versiones`}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {puedeCrear ? (
        <Button variant="outline" size="sm" className="shrink-0 self-start" disabled={subiendo} nativeButton={false} render={<label />}>
          <UploadIcon /> {subiendo ? "Subiendo…" : vigente ? "Versión nueva" : "Subir"}
          <input type="file" accept={ACCEPT_ARCHIVO} className="sr-only" onChange={subir} disabled={subiendo} aria-label={`Subir ${nombre}`} />
        </Button>
      ) : null}
    </div>
  );
}
