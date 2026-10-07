"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, PencilIcon, PlusIcon } from "lucide-react";
import { cn } from "cn";
import { guardarPeligro, retirarPeligro, type PeligroInput } from "@/lib/sst/peligros";
import type { AccionSst, PeligroSst } from "@/lib/sst/consultas";
import {
  ACEPTABILIDAD,
  CLASIFICACIONES,
  NIVELES_CONSECUENCIA,
  NIVELES_DEFICIENCIA,
  NIVELES_EXPOSICION,
  PLANTILLAS_SALUD,
  nivelProbabilidad,
  valorar,
} from "@/lib/sst/gtc45";
import { etiqueta } from "@/lib/sst/constantes";
import { SIN_SELECCION } from "@/lib/forms/opcional";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlanAccion } from "../_components/plan-accion";

type Sede = { id: string; nombre: string };

const TONO = {
  rojo: "bg-destructive/10 text-destructive border-destructive/30",
  ambar: "bg-amber-50 text-amber-800 border-amber-300",
  verde: "bg-emerald-50 text-emerald-800 border-emerald-200",
} as const;

export function NivelBadge({ nivel, nr }: { nivel: PeligroSst["nivel_riesgo"]; nr: number }) {
  const a = ACEPTABILIDAD[nivel];
  return (
    <span className={cn("inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", TONO[a.tono])}>
      Nivel {nivel} · NR {nr} · {a.texto}
    </span>
  );
}

export function NuevoPeligroBoton({ sedes }: { sedes: Sede[] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button size="sm" className="shrink-0" onClick={() => setAbierto(true)}>
        <PlusIcon /> Agregar peligro
      </Button>
      {abierto ? <PeligroDialog sedes={sedes} peligro={null} onCerrar={() => setAbierto(false)} /> : null}
    </>
  );
}

export function PeligroCard({
  peligro: p,
  sedes,
  acciones,
  usuarios,
  nombres,
  puedeCrear,
  puedeEditar,
}: {
  peligro: PeligroSst;
  sedes: Sede[];
  acciones: AccionSst[];
  usuarios: { id: string; nombre: string }[];
  nombres: Record<string, string>;
  puedeCrear: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const abiertas = acciones.filter((a) => a.estado !== "cerrada").length;
  const sede = sedes.find((s) => s.id === p.sede_id)?.nombre;

  async function retirar() {
    const r = await retirarPeligro(p.id, motivo);
    if (r.error) return toast.add({ title: "No se retiró", description: r.error, type: "error" });
    toast.add({ title: "Peligro retirado de la matriz", type: "success" });
    router.refresh();
  }

  return (
    <li className="rounded-xl border bg-card">
      <div className="space-y-2 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{p.descripcion}</p>
            <p className="text-xs text-muted-foreground">
              {etiqueta(CLASIFICACIONES, p.clasificacion)} · {p.proceso} · {p.actividad}
              {p.cargos ? ` · ${p.cargos}` : ""}
              {sede ? ` · ${sede}` : ""} · {p.expuestos} expuesto{p.expuestos === 1 ? "" : "s"}
              {p.rutinaria ? "" : " · no rutinaria"}
            </p>
          </div>
          <NivelBadge nivel={p.nivel_riesgo} nr={p.nr} />
        </div>
        {p.efectos ? <p className="text-sm">Efectos: {p.efectos}</p> : null}
        <p className="text-xs text-muted-foreground">
          Probabilidad {nivelProbabilidad(p.np).toLowerCase()} (NP {p.np}) · {ACEPTABILIDAD[p.nivel_riesgo].accion}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
            <ChevronDownIcon className={cn("transition-transform", abierta && "rotate-180")} />
            Medidas{acciones.length ? ` (${abiertas} abierta${abiertas === 1 ? "" : "s"} de ${acciones.length})` : ""}
          </Button>
          {puedeEditar ? (
            <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
              <PencilIcon /> Editar
            </Button>
          ) : null}
          {puedeEditar && !retirando ? (
            <Button variant="ghost" size="sm" onClick={() => setRetirando(true)}>
              Ya no aplica
            </Button>
          ) : null}
        </div>
        {retirando ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="¿Por qué ya no aplica? (mínimo 10 caracteres)" aria-label="Motivo" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setRetirando(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="destructive" disabled={motivo.trim().length < 10} onClick={retirar}>
                Retirar
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {abierta ? (
        <div className="space-y-3 border-t p-4">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Controles en la fuente</dt>
            <dd>{p.control_fuente || "—"}</dd>
            <dt className="text-muted-foreground">En el medio</dt>
            <dd>{p.control_medio || "—"}</dd>
            <dt className="text-muted-foreground">En la persona</dt>
            <dd>{p.control_individuo || "—"}</dd>
          </dl>
          <PlanAccion origen="matriz" origenId={p.id} acciones={acciones} usuarios={usuarios} nombres={nombres} puedeCrear={puedeCrear} puedeEditar={puedeEditar} />
        </div>
      ) : null}
      {editando ? <PeligroDialog sedes={sedes} peligro={p} onCerrar={() => setEditando(false)} /> : null}
    </li>
  );
}

function vacio(): PeligroInput {
  return {
    sedeId: null,
    proceso: "Asistencial",
    actividad: "",
    cargos: null,
    rutinaria: true,
    clasificacion: "biologico",
    descripcion: "",
    efectos: null,
    expuestos: 1,
    controlFuente: null,
    controlMedio: null,
    controlIndividuo: null,
    nd: 6,
    ne: 3,
    nc: 25,
    peorConsecuencia: null,
    requisitoLegal: null,
  };
}

function desde(p: PeligroSst): PeligroInput {
  return {
    sedeId: p.sede_id,
    proceso: p.proceso,
    actividad: p.actividad,
    cargos: p.cargos,
    rutinaria: p.rutinaria,
    clasificacion: p.clasificacion,
    descripcion: p.descripcion,
    efectos: p.efectos,
    expuestos: p.expuestos,
    controlFuente: p.control_fuente,
    controlMedio: p.control_medio,
    controlIndividuo: p.control_individuo,
    nd: p.nd,
    ne: p.ne,
    nc: p.nc,
    peorConsecuencia: p.peor_consecuencia,
    requisitoLegal: p.requisito_legal,
  };
}

function PeligroDialog({ sedes, peligro, onCerrar }: { sedes: Sede[]; peligro: PeligroSst | null; onCerrar: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<PeligroInput>(peligro ? desde(peligro) : vacio());
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const val = valorar(v.nd, v.ne, v.nc);
  const set = <K extends keyof PeligroInput>(k: K, x: PeligroInput[K]) => setV((prev) => ({ ...prev, [k]: x }));

  function usarPlantilla(clave: string | null) {
    const pl = PLANTILLAS_SALUD.find((x) => x.clave === clave);
    if (!pl) return;
    setV((prev) => ({
      ...prev,
      clasificacion: pl.clasificacion,
      descripcion: pl.descripcion,
      efectos: pl.efectos,
      actividad: pl.actividad,
      controlIndividuo: pl.controlIndividuo ?? prev.controlIndividuo,
    }));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setPendiente(true);
    setError(null);
    const r = await guardarPeligro(peligro?.id ?? null, v);
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: peligro ? "Peligro actualizado" : "Peligro agregado", type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{peligro ? "Editar peligro" : "Agregar un peligro"}</DialogTitle>
          <DialogDescription>Valoración de la GTC 45: deficiencia × exposición × consecuencia.</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {!peligro ? (
            <div className="space-y-1">
              <Label htmlFor="plantilla">Empezar desde una plantilla del sector salud</Label>
              <Combobox
                id="plantilla"
                items={[{ value: SIN_SELECCION, label: "Sin plantilla" }, ...PLANTILLAS_SALUD.map((x) => ({ value: x.clave, label: `${etiqueta(CLASIFICACIONES, x.clasificacion)}: ${x.descripcion}` }))]}
                defaultValue={SIN_SELECCION}
                onValueChange={usarPlantilla}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="clasificacion">Clasificación</Label>
              <Combobox id="clasificacion" items={CLASIFICACIONES.map((c) => ({ value: c.value, label: c.label }))} value={v.clasificacion} onValueChange={(x) => set("clasificacion", x ?? "biologico")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sedePeligro">Sede</Label>
              <Combobox
                id="sedePeligro"
                items={[{ value: SIN_SELECCION, label: "Todas" }, ...sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
                value={v.sedeId ?? SIN_SELECCION}
                onValueChange={(x) => set("sedeId", x && x !== SIN_SELECCION ? x : null)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="descripcionPeligro">Peligro</Label>
            <Input id="descripcionPeligro" value={v.descripcion} onChange={(e) => set("descripcion", e.target.value)} maxLength={500} required />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="proceso">Proceso</Label>
              <Input id="proceso" value={v.proceso} onChange={(e) => set("proceso", e.target.value)} maxLength={200} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="actividad">Actividad</Label>
              <Input id="actividad" value={v.actividad} onChange={(e) => set("actividad", e.target.value)} maxLength={300} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cargos">Cargos expuestos</Label>
              <Input id="cargos" value={v.cargos ?? ""} onChange={(e) => set("cargos", e.target.value)} maxLength={300} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-1">
              <Label htmlFor="efectos">Efectos posibles</Label>
              <Input id="efectos" value={v.efectos ?? ""} onChange={(e) => set("efectos", e.target.value)} maxLength={1000} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expuestos">Expuestos</Label>
              <Input id="expuestos" type="number" min={0} value={v.expuestos} onChange={(e) => set("expuestos", Number(e.target.value) || 0)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={v.rutinaria} onCheckedChange={(x) => set("rutinaria", !!x)} /> Actividad rutinaria
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Controles que ya existen</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input aria-label="Control en la fuente" placeholder="En la fuente" value={v.controlFuente ?? ""} onChange={(e) => set("controlFuente", e.target.value)} maxLength={1000} />
              <Input aria-label="Control en el medio" placeholder="En el medio" value={v.controlMedio ?? ""} onChange={(e) => set("controlMedio", e.target.value)} maxLength={1000} />
              <Input aria-label="Control en la persona" placeholder="En la persona" value={v.controlIndividuo ?? ""} onChange={(e) => set("controlIndividuo", e.target.value)} maxLength={1000} />
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Escala id="nd" etiqueta="Deficiencia" opciones={NIVELES_DEFICIENCIA} valor={v.nd} onCambio={(x) => set("nd", x)} />
            <Escala id="ne" etiqueta="Exposición" opciones={NIVELES_EXPOSICION} valor={v.ne} onCambio={(x) => set("ne", x)} />
            <Escala id="nc" etiqueta="Consecuencia" opciones={NIVELES_CONSECUENCIA} valor={v.nc} onCambio={(x) => set("nc", x)} />
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm" aria-live="polite">
            <span>
              NP {val.np} ({nivelProbabilidad(val.np).toLowerCase()}) × NC {v.nc} =
            </span>
            <NivelBadge nivel={val.nivel} nr={val.nr} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Escala({
  id,
  etiqueta: titulo,
  opciones,
  valor,
  onCambio,
}: {
  id: string;
  etiqueta: string;
  opciones: readonly { value: number; label: string; ayuda: string }[];
  valor: number;
  onCambio: (v: number) => void;
}) {
  const actual = opciones.find((o) => o.value === valor);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{titulo}</Label>
      <Combobox id={id} items={opciones.map((o) => ({ value: String(o.value), label: o.label }))} value={String(valor)} onValueChange={(x) => onCambio(Number(x ?? opciones[0].value))} />
      {actual ? <p className="text-xs text-muted-foreground">{actual.ayuda}</p> : null}
    </div>
  );
}
