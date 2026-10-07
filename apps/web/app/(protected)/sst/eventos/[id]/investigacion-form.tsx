"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { guardarInvestigacion, urlInforme } from "@/lib/sst/eventos";
import { subirArchivoSst } from "@/lib/sst/subida-cliente";
import { METODOLOGIAS, ROLES_EQUIPO, etiqueta } from "@/lib/sst/constantes";
import type { Investigacion } from "@/lib/sst/consultas";
import { ACCEPT_ARCHIVO } from "@/lib/habilitacion/constantes";
import { fechaLegible, hoyColombiaCliente } from "@/lib/habilitacion/ruta";
import { SIN_SELECCION } from "@/lib/forms/opcional";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { abrirFirmado } from "../../../habilitacion/_components/abrir-firmado";

type Miembro = { nombre: string; rol: string };

export function InvestigacionForm({
  accidenteId,
  investigacion: inv,
  puedeGuardar,
  grave,
}: {
  accidenteId: string;
  investigacion: Investigacion | null;
  puedeGuardar: boolean;
  grave: boolean;
}) {
  const router = useRouter();
  const hoy = hoyColombiaCliente();
  // Defaults congelados al montar (ver SeguimientoForm); `inv` sigue vivo
  // para el estado y el informe cargado.
  const [ini] = useState(inv);
  const [equipo, setEquipo] = useState<Miembro[]>(inv?.equipo?.length ? inv.equipo : [{ nombre: "", rol: "jefe_inmediato" }]);
  const [cerrar, setCerrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  if (inv?.estado === "cerrada") {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Cerrada el {fechaLegible(inv.fecha_cierre)} · {etiqueta(METODOLOGIAS, inv.metodologia)}
        </p>
        <p>
          <span className="font-medium">Equipo:</span> {inv.equipo.map((m) => `${m.nombre} (${etiqueta(ROLES_EQUIPO, m.rol)})`).join(", ")}
        </p>
        {inv.descripcion ? <p className="whitespace-pre-line">{inv.descripcion}</p> : null}
        <p className="whitespace-pre-line">
          <span className="font-medium">Causas inmediatas:</span> {inv.causas_inmediatas}
        </p>
        <p className="whitespace-pre-line">
          <span className="font-medium">Causas básicas:</span> {inv.causas_basicas}
        </p>
        {inv.conclusiones ? (
          <p className="whitespace-pre-line">
            <span className="font-medium">Conclusiones:</span> {inv.conclusiones}
          </p>
        ) : null}
        {inv.informe_nombre_archivo ? (
          <button type="button" onClick={() => abrirFirmado(() => urlInforme(accidenteId))} className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            <DownloadIcon className="size-4" /> {inv.informe_nombre_archivo}
          </button>
        ) : null}
      </div>
    );
  }

  async function guardar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const t = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v && v !== SIN_SELECCION ? v : null;
    };
    setPendiente(true);
    setError(null);
    try {
      let informePath: string | null = null;
      let informeNombre: string | null = null;
      const archivo = fd.get("informe");
      if (archivo instanceof File && archivo.size > 0) {
        const s = await subirArchivoSst(archivo, "investigaciones", accidenteId);
        if ("error" in s) return setError(s.error);
        informePath = s.path;
        informeNombre = s.nombre;
      }
      const r = await guardarInvestigacion(accidenteId, {
        fechaInicio: t("fechaInicio") ?? "",
        equipo,
        descripcion: t("descripcion"),
        metodologia: t("metodologia"),
        causasInmediatas: t("causasInmediatas"),
        causasBasicas: t("causasBasicas"),
        conclusiones: t("conclusiones"),
        cerrar,
        fechaCierre: t("fechaCierre"),
        informePath,
        informeNombre,
      });
      if (r.error) return setError(r.error);
      toast.add({ title: cerrar ? "Investigación cerrada" : "Investigación guardada", type: "success" });
      router.refresh();
    } finally {
      setPendiente(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={!puedeGuardar || pendiente} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="fechaInicio">Inicio de la investigación</Label>
            <Input id="fechaInicio" name="fechaInicio" type="date" max={hoy} defaultValue={ini?.fecha_inicio ?? hoy} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="metodologia">Metodología</Label>
            <Combobox
              id="metodologia"
              name="metodologia"
              items={[{ value: SIN_SELECCION, label: "Sin definir" }, ...METODOLOGIAS.map((m) => ({ value: m.value, label: m.label }))]}
              defaultValue={ini?.metodologia ?? "cinco_porques"}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Equipo investigador</Label>
          {grave ? <p className="text-xs text-amber-800">Accidente grave o mortal: incluye a un profesional con licencia en SST.</p> : null}
          <ul className="space-y-2">
            {equipo.map((m, i) => (
              <li key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_14rem_auto]">
                <Input
                  aria-label={`Nombre del integrante ${i + 1}`}
                  value={m.nombre}
                  maxLength={200}
                  onChange={(e) => setEquipo(equipo.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                  placeholder="Nombre"
                />
                <Combobox
                  aria-label={`Rol del integrante ${i + 1}`}
                  items={ROLES_EQUIPO.map((r) => ({ value: r.value, label: r.label }))}
                  value={m.rol}
                  onValueChange={(v) => setEquipo(equipo.map((x, j) => (j === i ? { ...x, rol: v ?? "otro" } : x)))}
                />
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar" onClick={() => setEquipo(equipo.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
          {equipo.length < 20 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setEquipo([...equipo, { nombre: "", rol: "otro" }])}>
              <PlusIcon /> Agregar integrante
            </Button>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="descripcion">Descripción de lo ocurrido</Label>
          <Textarea id="descripcion" name="descripcion" rows={3} maxLength={8000} defaultValue={ini?.descripcion ?? ""} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="causasInmediatas">Causas inmediatas</Label>
            <Textarea id="causasInmediatas" name="causasInmediatas" rows={3} maxLength={4000} defaultValue={ini?.causas_inmediatas ?? ""} placeholder="Actos y condiciones inseguras" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="causasBasicas">Causas básicas</Label>
            <Textarea id="causasBasicas" name="causasBasicas" rows={3} maxLength={4000} defaultValue={ini?.causas_basicas ?? ""} placeholder="Factores personales y del trabajo" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="conclusiones">Conclusiones (opcional)</Label>
          <Textarea id="conclusiones" name="conclusiones" rows={2} maxLength={4000} defaultValue={ini?.conclusiones ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="informe">Informe firmado (opcional)</Label>
          <FileInput id="informe" name="informe" accept={ACCEPT_ARCHIVO} />
          {inv?.informe_nombre_archivo ? <p className="text-xs text-muted-foreground">Cargado: {inv.informe_nombre_archivo}</p> : null}
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={cerrar} onCheckedChange={(v) => setCerrar(!!v)} /> Cerrar la investigación (ya no se podrá editar)
          </label>
          {cerrar ? (
            <div className="space-y-1 sm:w-48">
              <Label htmlFor="fechaCierre">Fecha de cierre</Label>
              <Input id="fechaCierre" name="fechaCierre" type="date" max={hoy} defaultValue={hoy} required />
            </div>
          ) : null}
        </div>
        {puedeGuardar ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : cerrar ? "Cerrar investigación" : inv ? "Guardar cambios" : "Iniciar investigación"}
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
