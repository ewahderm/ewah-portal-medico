"use client";

import { useState, useTransition } from "react";
import { cambiarPlanClinicaPlataforma, toggleActivoClinicaPlataforma } from "@/lib/plataforma/actions";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { exigirExito } from "@/lib/forms/resultado";

export function ClinicaFilaAcciones({
  clinicaId,
  planCodigoActual,
  activo,
  planes,
}: {
  clinicaId: string;
  planCodigoActual: string;
  activo: boolean;
  planes: { value: string; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCambiarPlan(planCodigo: string | null) {
    if (!planCodigo || planCodigo === planCodigoActual) return;
    setError(null);
    startTransition(async () => {
      try {
        exigirExito(await cambiarPlanClinicaPlataforma(clinicaId, planCodigo));
        toast.add({ title: "Plan actualizado", type: "success" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cambiar el plan.");
      }
    });
  }

  function handleToggleActivo() {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
    setError(null);
    startTransition(async () => {
      try {
        exigirExito(await toggleActivoClinicaPlataforma(clinicaId, !activo));
        toast.add({ title: activo ? "Clínica desactivada" : "Clínica activada", type: "success" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar la clínica.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Combobox
          items={planes}
          value={planCodigoActual}
          onValueChange={handleCambiarPlan}
          placeholder="Plan..."
          className="w-36"
        />
        <Button
          type="button"
          size="sm"
          variant={activo ? "outline" : "default"}
          onClick={handleToggleActivo}
          onBlur={() => setConfirmando(false)}
          disabled={pending}
        >
          {confirmando ? "¿Confirmar?" : activo ? "Desactivar" : "Activar"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
