"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Opcion = { id: string; nombre: string };

const TODAS = "__todas__";

export function FiltrosAgenda({
  sedes,
  profesionales,
}: {
  sedes: Opcion[];
  profesionales: Opcion[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function actualizar(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor === TODAS) params.delete(clave);
    else params.set(clave, valor);
    router.push(`/citas?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="filtroSede">Sede</Label>
        <Select
          items={[{ value: TODAS, label: "Todas" }, ...sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
          defaultValue={searchParams.get("sedeId") ?? TODAS}
          onValueChange={(valor) => actualizar("sedeId", String(valor))}
        >
          <SelectTrigger id="filtroSede" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas</SelectItem>
            {sedes.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filtroProfesional">Profesional</Label>
        <Select
          items={[
            { value: TODAS, label: "Todos" },
            ...profesionales.map((p) => ({ value: p.id, label: p.nombre })),
          ]}
          defaultValue={searchParams.get("profesionalId") ?? TODAS}
          onValueChange={(valor) => actualizar("profesionalId", String(valor))}
        >
          <SelectTrigger id="filtroProfesional" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todos</SelectItem>
            {profesionales.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
