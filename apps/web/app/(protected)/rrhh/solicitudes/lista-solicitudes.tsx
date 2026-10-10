"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelarSolicitud, resolverSolicitud } from "@/lib/rrhh/solicitudes";
import {
  ESTADOS_SOLICITUD,
  formatoDias,
  formatoHoras,
  MODALIDADES,
  tituloModalidad,
  tituloTipo,
  type ModalidadPermiso,
  type SolicitudFila,
} from "@/lib/rrhh/solicitudes-tipos";
import { ERROR_INESPERADO, type ResultadoAccion } from "@/lib/forms/resultado";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function Estado({ estado }: { estado: SolicitudFila["estado"] }) {
  const clases: Record<SolicitudFila["estado"], string> = {
    pendiente: "border-amber-300 text-amber-700 dark:text-amber-400",
    aprobada: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    rechazada: "border-transparent bg-destructive/10 text-destructive",
    cancelada: "text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={clases[estado]}>
      {ESTADOS_SOLICITUD[estado]}
    </Badge>
  );
}

export function detalleSolicitud(s: SolicitudFila): string {
  if (s.tipo === "vacaciones" && s.fecha_inicio && s.fecha_fin) {
    return `${fechaLegible(s.fecha_inicio)} al ${fechaLegible(s.fecha_fin)} · ${formatoDias(s.dias ?? 0)} hábiles`;
  }
  return `${s.fecha ? fechaLegible(s.fecha) : ""} · ${s.hora_inicio} a ${s.hora_fin} · ${formatoHoras(s.horas ?? 0)}`;
}

// Lista de solicitudes. `aprobar`: muestra Aprobar/Rechazar en las
// pendientes. `cancelarPropias`: deja cancelar las pendientes.
export function ListaSolicitudes({
  solicitudes,
  mostrarEmpleado = false,
  aprobar = false,
  cancelar = false,
  vacio,
}: {
  solicitudes: SolicitudFila[];
  mostrarEmpleado?: boolean;
  aprobar?: boolean;
  cancelar?: boolean;
  vacio: string;
}) {
  const [resolviendo, setResolviendo] = useState<{ s: SolicitudFila; aprobar: boolean } | null>(null);
  if (solicitudes.length === 0) return <p className="text-sm text-muted-foreground">{vacio}</p>;
  return (
    <>
      <ul className="divide-y rounded-lg border">
        {solicitudes.map((s) => (
          <FilaSolicitud
            key={s.id}
            s={s}
            mostrarEmpleado={mostrarEmpleado}
            aprobar={aprobar}
            cancelar={cancelar}
            onResolver={(aprobarla) => setResolviendo({ s, aprobar: aprobarla })}
          />
        ))}
      </ul>
      {resolviendo ? <ResolverDialog s={resolviendo.s} aprobar={resolviendo.aprobar} onCerrar={() => setResolviendo(null)} /> : null}
    </>
  );
}

function FilaSolicitud({
  s,
  mostrarEmpleado,
  aprobar,
  cancelar,
  onResolver,
}: {
  s: SolicitudFila;
  mostrarEmpleado: boolean;
  aprobar: boolean;
  cancelar: boolean;
  onResolver: (aprobar: boolean) => void;
}) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esPendiente = s.estado === "pendiente";

  async function cancelarla() {
    setPendiente(true);
    setError(null);
    try {
      const r: ResultadoAccion = await cancelarSolicitud(s.id);
      if (r.error) return setError(r.error);
      toast.add({ title: "Solicitud cancelada", type: "success" });
      router.refresh();
    } catch {
      setError(ERROR_INESPERADO);
    } finally {
      setPendiente(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-start">
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{mostrarEmpleado ? `${s.empleado?.nombre ?? "Empleado"} · ` : ""}{tituloTipo(s.tipo)}</span>
          <Estado estado={s.estado} />
          {s.tipo === "vacaciones" && s.excede_saldo ? (
            <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
              Excede el saldo
            </Badge>
          ) : null}
          {s.modalidad ? <Badge variant="outline">{tituloModalidad(s.modalidad)}</Badge> : null}
        </span>
        <span className="block text-muted-foreground">{detalleSolicitud(s)}</span>
        {s.motivo ? <span className="block text-xs break-words text-muted-foreground">“{s.motivo}”</span> : null}
        <span className="block text-xs text-muted-foreground">
          Solicitada el {fechaLegible(s.created_at.slice(0, 10))}
          {s.solicitante && mostrarEmpleado && s.solicitante.nombre !== s.empleado?.nombre ? ` por ${s.solicitante.nombre}` : ""}
          {s.resolutor && !esPendiente ? ` · ${ESTADOS_SOLICITUD[s.estado].toLowerCase()} por ${s.resolutor.nombre}` : ""}
        </span>
        {s.comentario_resolucion ? <span className="block text-xs break-words">Comentario: {s.comentario_resolucion}</span> : null}
        {error ? <span className="block text-xs text-destructive">{error}</span> : null}
      </span>
      {esPendiente ? (
        <span className="flex shrink-0 flex-wrap gap-2">
          {aprobar ? (
            <>
              <Button size="sm" onClick={() => onResolver(true)}>
                Aprobar
              </Button>
              <Button size="sm" variant="outline" onClick={() => onResolver(false)}>
                Rechazar
              </Button>
            </>
          ) : null}
          {cancelar ? (
            <Button size="sm" variant="ghost" onClick={cancelarla} disabled={pendiente}>
              Cancelar solicitud
            </Button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

function ResolverDialog({ s, aprobar, onCerrar }: { s: SolicitudFila; aprobar: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const [modalidad, setModalidad] = useState<ModalidadPermiso | null>(null);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const esPermiso = s.tipo === "permiso";

  async function confirmar(ev: React.FormEvent) {
    ev.preventDefault();
    if (aprobar && esPermiso && !modalidad) return setError("Elige si el permiso se repone, es remunerado o no remunerado.");
    if (!aprobar && comentario.trim().length < 3) return setError("Escribe por qué se rechaza.");
    setEnviando(true);
    setError(null);
    try {
      const r = await resolverSolicitud({ id: s.id, aprobar, modalidad, comentario });
      if (r.error) return setError(r.error);
      toast.add({ title: aprobar ? "Solicitud aprobada" : "Solicitud rechazada", description: "El empleado recibirá un aviso.", type: "success" });
      router.refresh();
      onCerrar();
    } catch {
      setError(ERROR_INESPERADO);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{aprobar ? "Aprobar" : "Rechazar"} · {tituloTipo(s.tipo)}</DialogTitle>
          <DialogDescription>
            {s.empleado?.nombre ? `${s.empleado.nombre}: ` : ""}
            {detalleSolicitud(s)}
            {aprobar && s.tipo === "vacaciones" ? ". Quedan registradas en sus vacaciones y descuentan de su saldo." : ""}
            {aprobar && s.tipo === "vacaciones" && s.excede_saldo ? " Ojo: pide más días de los que tiene acumulados." : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={confirmar} className="space-y-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {aprobar && esPermiso ? (
            <div className="space-y-2" role="radiogroup" aria-label="Cómo se aprueba el permiso">
              {MODALIDADES.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  role="radio"
                  aria-checked={modalidad === m.valor}
                  onClick={() => setModalidad(m.valor)}
                  className={cn("block w-full rounded-lg border p-2.5 text-left text-sm", modalidad === m.valor ? "border-primary bg-accent" : "hover:bg-muted")}
                >
                  <span className="block font-medium">{m.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{m.ayuda}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="comentarioResolucion">{aprobar ? "Comentario (opcional)" : "¿Por qué se rechaza?"}</Label>
            <Textarea id="comentarioResolucion" rows={2} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" variant={aprobar ? "default" : "destructive"} disabled={enviando}>
              {enviando ? "Guardando…" : aprobar ? "Aprobar" : "Rechazar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
