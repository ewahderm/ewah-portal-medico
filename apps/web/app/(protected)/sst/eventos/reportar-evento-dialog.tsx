"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { registrarEvento } from "@/lib/sst/eventos";
import { GRAVEDADES, TIPOS_EVENTO } from "@/lib/sst/constantes";
import { hoyColombiaCliente } from "@/lib/habilitacion/ruta";
import { SIN_SELECCION } from "@/lib/forms/opcional";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Opcion = { id: string; nombre: string };

export function ReportarEventoBoton({ personas, sedes }: { personas: Opcion[]; sedes: Opcion[] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button size="sm" className="shrink-0" onClick={() => setAbierto(true)}>
        <PlusIcon /> Reportar un evento
      </Button>
      {abierto ? <ReportarEventoDialog personas={personas} sedes={sedes} onCerrar={() => setAbierto(false)} /> : null}
    </>
  );
}

function ReportarEventoDialog({ personas, sedes, onCerrar }: { personas: Opcion[]; sedes: Opcion[]; onCerrar: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<string>("accidente");
  const [biologico, setBiologico] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const hoy = hoyColombiaCliente();

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => {
      const x = String(fd.get(k) ?? "").trim();
      return x && x !== SIN_SELECCION ? x : null;
    };
    setPendiente(true);
    setError(null);
    try {
      const r = await registrarEvento({
        tipo,
        empleadoId: v("empleadoId") ?? "",
        fecha: v("fecha") ?? "",
        hora: v("hora"),
        sedeId: v("sedeId"),
        lugar: v("lugar"),
        resumen: v("resumen") ?? "",
        gravedad: v("gravedad"),
        tipoLesion: v("tipoLesion"),
        parteCuerpo: v("parteCuerpo"),
        agente: v("agente"),
        riesgoBiologico: biologico,
      });
      if (r.error) return setError(r.error);
      toast.add({ title: "Evento registrado", description: "Revisa los plazos de reporte e investigación.", type: "success" });
      router.push(`/sst/eventos/${r.id}`);
    } finally {
      setPendiente(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reportar un evento</DialogTitle>
          <DialogDescription>Regístralo apenas pase: los 2 días hábiles para avisar a la ARL corren desde la fecha del evento.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Qué pasó">
            {TIPOS_EVENTO.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={tipo === t.value}
                onClick={() => setTipo(t.value)}
                className={"rounded-lg border p-2 text-left text-sm transition-colors " + (tipo === t.value ? "border-primary bg-accent" : "hover:bg-muted")}
              >
                <span className="block font-medium">{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.ayuda}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="empleadoId">Persona</Label>
              <Combobox id="empleadoId" name="empleadoId" items={personas.map((p) => ({ value: p.id, label: p.nombre }))} required />
              {personas.length === 0 ? <p className="text-xs text-muted-foreground">Primero registra a tu personal en RRHH.</p> : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="fecha">{tipo === "enfermedad_laboral" ? "Fecha del diagnóstico" : "Fecha"}</Label>
              <Input id="fecha" name="fecha" type="date" defaultValue={hoy} max={hoy} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hora">Hora (opcional)</Label>
              <Input id="hora" name="hora" type="time" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sedeId">Sede</Label>
              <Combobox
                id="sedeId"
                name="sedeId"
                items={[{ value: SIN_SELECCION, label: "Sin sede" }, ...sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
                defaultValue={sedes.length === 1 ? sedes[0].id : SIN_SELECCION}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lugar">Lugar exacto</Label>
              <Input id="lugar" name="lugar" maxLength={200} placeholder="Ej.: consultorio 2" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="resumen">¿Qué pasó?</Label>
            <Textarea id="resumen" name="resumen" rows={3} minLength={10} maxLength={4000} required />
          </div>
          {tipo !== "incidente" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="gravedad">Gravedad</Label>
                <Combobox id="gravedad" name="gravedad" items={GRAVEDADES.map((g) => ({ value: g.value, label: g.label }))} defaultValue="leve" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tipoLesion">Tipo de lesión</Label>
                <Input id="tipoLesion" name="tipoLesion" maxLength={200} placeholder="Ej.: herida punzante" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="parteCuerpo">Parte del cuerpo</Label>
                <Input id="parteCuerpo" name="parteCuerpo" maxLength={200} placeholder="Ej.: dedo índice izquierdo" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="agente">Agente o elemento</Label>
                <Input id="agente" name="agente" maxLength={200} placeholder="Ej.: aguja hipodérmica" />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="agente">Agente o elemento (opcional)</Label>
              <Input id="agente" name="agente" maxLength={200} />
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={biologico} onCheckedChange={(v) => setBiologico(!!v)} />
            <span>
              Hubo exposición a riesgo biológico (pinchazo, salpicadura, corte con material contaminado).
              <span className="block text-xs text-muted-foreground">Activa el protocolo de exposición: atención inmediata y seguimiento.</span>
            </span>
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente || personas.length === 0}>
              {pendiente ? "Guardando…" : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
