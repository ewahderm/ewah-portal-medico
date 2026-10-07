"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { avanzarAccion, crearAccion } from "@/lib/sst/eventos";
import { ESTADOS_ACCION, TIPOS_ACCION, etiqueta } from "@/lib/sst/constantes";
import { JERARQUIA } from "@/lib/sst/gtc45";
import type { AccionSst } from "@/lib/sst/consultas";
import { diasHasta, fechaLegible, hoyColombiaCliente, sumarDias } from "@/lib/habilitacion/ruta";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Plan de acción de cualquier origen (investigación de un evento o peligro
// de la matriz, que además pide el tipo de control de la jerarquía).
export function PlanAccion({
  origen,
  origenId,
  acciones,
  usuarios,
  nombres,
  puedeCrear,
  puedeEditar,
}: {
  origen: "investigacion" | "matriz";
  origenId: string;
  acciones: AccionSst[];
  usuarios: { id: string; nombre: string }[];
  nombres: Record<string, string>;
  puedeCrear: boolean;
  puedeEditar: boolean;
}) {
  const [nueva, setNueva] = useState(false);
  return (
    <div className="space-y-3">
      {acciones.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay acciones.</p> : null}
      <ul className="space-y-2">
        {acciones.map((a) => (
          <AccionItem key={a.id} accion={a} responsable={nombres[a.responsable_id]} puedeEditar={puedeEditar} />
        ))}
      </ul>
      {puedeCrear ? (
        nueva ? (
          <NuevaAccion origen={origen} origenId={origenId} usuarios={usuarios} onCerrar={() => setNueva(false)} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setNueva(true)}>
            <PlusIcon /> Agregar acción
          </Button>
        )
      ) : null}
    </div>
  );
}

function AccionItem({ accion: a, responsable, puedeEditar }: { accion: AccionSst; responsable?: string; puedeEditar: boolean }) {
  const router = useRouter();
  const [cerrando, setCerrando] = useState(false);
  const [obs, setObs] = useState("");
  const [fecha, setFecha] = useState(hoyColombiaCliente());
  const [pendiente, setPendiente] = useState(false);
  const vencida = a.estado !== "cerrada" && diasHasta(a.fecha_compromiso, hoyColombiaCliente()) < 0;

  async function avanzar(estado: "en_curso" | "cerrada") {
    setPendiente(true);
    const r = await avanzarAccion(a.id, estado, estado === "cerrada" ? obs : null, estado === "cerrada" ? fecha : null);
    setPendiente(false);
    if (r.error) return toast.add({ title: "No se actualizó", description: r.error, type: "error" });
    setCerrando(false);
    router.refresh();
  }

  return (
    <li className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={a.estado === "cerrada" ? "secondary" : vencida ? "destructive" : "outline"}>
          {vencida ? "Vencida" : etiqueta(ESTADOS_ACCION, a.estado)}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {a.jerarquia ? etiqueta(JERARQUIA, a.jerarquia) : etiqueta(TIPOS_ACCION, a.tipo)} · {responsable ?? "—"} · para el {fechaLegible(a.fecha_compromiso)}
        </span>
      </div>
      <p>{a.descripcion}</p>
      {a.estado === "cerrada" ? (
        <p className="text-xs text-muted-foreground">
          Cerrada el {fechaLegible(a.fecha_cierre)}: {a.cierre_observacion}
        </p>
      ) : puedeEditar ? (
        cerrando ? (
          <div className="space-y-2">
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={4000} placeholder="¿Cómo se cumplió? (al menos 10 caracteres)" aria-label="Cómo se cumplió" />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input type="date" value={fecha} max={hoyColombiaCliente()} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha de cierre" className="sm:w-44" />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setCerrando(false)} disabled={pendiente}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => avanzar("cerrada")} disabled={pendiente || obs.trim().length < 10}>
                  Cerrar acción
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {a.estado === "abierta" ? (
              <Button size="sm" variant="outline" onClick={() => avanzar("en_curso")} disabled={pendiente}>
                Marcar en curso
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setCerrando(true)}>
              Cerrar
            </Button>
          </div>
        )
      ) : null}
    </li>
  );
}

function NuevaAccion({
  origen,
  origenId,
  usuarios,
  onCerrar,
}: {
  origen: "investigacion" | "matriz";
  origenId: string;
  usuarios: { id: string; nombre: string }[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const hoy = hoyColombiaCliente();

  async function crear(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    setPendiente(true);
    setError(null);
    const r = await crearAccion({
      origen,
      origenId,
      tipo: origen === "matriz" ? "preventiva" : String(fd.get("tipo") ?? "correctiva"),
      jerarquia: origen === "matriz" ? String(fd.get("jerarquia") ?? "administrativo") : null,
      descripcion: String(fd.get("descripcion") ?? ""),
      responsableId: String(fd.get("responsableId") ?? ""),
      fechaCompromiso: String(fd.get("fechaCompromiso") ?? ""),
    });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Acción agregada", type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <form onSubmit={crear} className="space-y-3 rounded-lg border p-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor={`descripcionAccion-${origenId}`}>{origen === "matriz" ? "Medida de intervención" : "Acción"}</Label>
        <Textarea id={`descripcionAccion-${origenId}`} name="descripcion" rows={2} minLength={10} maxLength={2000} required />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {origen === "matriz" ? (
          <div className="space-y-1">
            <Label htmlFor={`jerarquia-${origenId}`}>Tipo de control</Label>
            <Combobox id={`jerarquia-${origenId}`} name="jerarquia" items={JERARQUIA.map((j) => ({ value: j.value, label: j.label }))} defaultValue="administrativo" />
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="tipoAccion">Tipo</Label>
            <Combobox id="tipoAccion" name="tipo" items={TIPOS_ACCION.map((t) => ({ value: t.value, label: t.label }))} defaultValue="correctiva" />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor={`responsableId-${origenId}`}>Responsable</Label>
          <Combobox id={`responsableId-${origenId}`} name="responsableId" items={usuarios.map((u) => ({ value: u.id, label: u.nombre }))} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`fechaCompromiso-${origenId}`}>Para cuándo</Label>
          <Input id={`fechaCompromiso-${origenId}`} name="fechaCompromiso" type="date" min={hoy} defaultValue={sumarDias(hoy, 30)} required />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCerrar} disabled={pendiente}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Agregar"}
        </Button>
      </div>
    </form>
  );
}
