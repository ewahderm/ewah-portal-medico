"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { guardarPerfilSst } from "@/lib/sst/perfil";
import { FORMACIONES_RESPONSABLE, MODOS_SST } from "@/lib/sst/constantes";
import type { PerfilSst } from "@/lib/sst/consultas";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { SIN_SELECCION } from "@/lib/forms/opcional";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function PerfilSstForm({ perfil: perfilInicial, puedeEditar }: { perfil: PerfilSst | null; puedeEditar: boolean }) {
  // Los valores por defecto se congelan al montar: tras guardar, la página
  // se revalida y Base UI no admite que cambie el defaultValue de un campo
  // no controlado (lo que se ve ya es lo que se guardó).
  const [perfil] = useState(perfilInicial);
  const [state, formAction, pending] = useActionState(guardarPerfilSst, null);
  const [modo, setModo] = useState<string>(perfil?.modo ?? "empleador");
  const [excluye, setExcluye] = useState(perfil?.excluye_contratistas ?? false);

  useCerrarAlExito(pending, !state?.error, () => toast.add({ title: "Datos del SG-SST guardados", type: "success" }));

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={!puedeEditar || pending} className="space-y-5">
        <div className="space-y-2">
          <Label>¿Cómo trabajas?</Label>
          <input type="hidden" name="modo" value={modo} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Cómo trabajas">
            {MODOS_SST.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={modo === m.value}
                onClick={() => setModo(m.value)}
                className={
                  "rounded-lg border p-3 text-left text-sm transition-colors " +
                  (modo === m.value ? "border-primary bg-accent" : "hover:bg-muted")
                }
              >
                <span className="block font-medium">{m.label}</span>
                <span className="text-xs text-muted-foreground">{m.ayuda}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1 rounded-lg border p-3">
            <p className="text-sm font-medium">Actividad económica de la clínica</p>
            <p className="text-xs text-muted-foreground">
              Este dato se administra desde{" "}
              <Link href="/parametros" className="text-primary underline underline-offset-4">
                Parámetros &gt; Datos básicos
              </Link>
              .
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="otrosTrabajadores">Otros trabajadores que no están en RRHH</Label>
            <Input
              id="otrosTrabajadores"
              name="otrosTrabajadores"
              type="number"
              min={0}
              max={100000}
              defaultValue={perfil?.otros_trabajadores ?? 0}
            />
            <p className="text-xs text-muted-foreground">Cooperados, trabajadores en misión o estudiantes afiliados por ti.</p>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="otrosDetalle">¿Quiénes son? (opcional)</Label>
          <Input id="otrosDetalle" name="otrosDetalle" maxLength={500} defaultValue={perfil?.otros_trabajadores_detalle ?? ""} />
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox name="excluyeContratistas" checked={excluye} onCheckedChange={(v) => setExcluye(!!v)} />
            <span>
              No contar a los contratistas (prestación de servicios) para el tamaño.
              <span className="block text-xs text-muted-foreground">
                La Res. 0312 los incluye en su campo de aplicación: solo apártate de eso con una razón (por ejemplo, contratos
                de menos de un mes).
              </span>
            </span>
          </label>
          {excluye ? (
            <div className="space-y-1">
              <Label htmlFor="justificacionExclusion">¿Por qué?</Label>
              <Textarea
                id="justificacionExclusion"
                name="justificacionExclusion"
                rows={2}
                minLength={10}
                maxLength={2000}
                required
                defaultValue={perfil?.justificacion_exclusion ?? ""}
              />
            </div>
          ) : null}
        </div>

        {modo === "empleador" ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Responsable del SG-SST</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="responsableNombre">Nombre</Label>
                <Input id="responsableNombre" name="responsableNombre" maxLength={200} defaultValue={perfil?.responsable_nombre ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="responsableFormacion">Formación</Label>
                <Combobox
                  id="responsableFormacion"
                  name="responsableFormacion"
                  items={[{ value: SIN_SELECCION, label: "Sin definir" }, ...FORMACIONES_RESPONSABLE.map((f) => ({ value: f.value, label: f.label }))]}
                  defaultValue={perfil?.responsable_formacion ?? SIN_SELECCION}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="responsableLicencia">Número de licencia en SST</Label>
                <Input id="responsableLicencia" name="responsableLicencia" maxLength={100} defaultValue={perfil?.responsable_licencia ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="responsableLicenciaVence">La licencia vence el</Label>
                <Input id="responsableLicenciaVence" name="responsableLicenciaVence" type="date" defaultValue={perfil?.responsable_licencia_vence ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="responsableCurso50h">Aprobó el curso de 50 horas el</Label>
                <Input id="responsableCurso50h" name="responsableCurso50h" type="date" defaultValue={perfil?.responsable_curso_50h ?? ""} />
              </div>
            </div>
          </fieldset>
        ) : null}

        {puedeEditar ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Solo lectura: pide a un administrador el permiso para editar el SG-SST.</p>
        )}
      </fieldset>
    </form>
  );
}
