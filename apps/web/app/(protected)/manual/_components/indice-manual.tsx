"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconoGuia } from "./iconos";

type Resumen = { slug: string; titulo: string; resumen: string; grupo: string; icono: string; texto: string };

export function IndiceManual({ guias, grupos }: { guias: Resumen[]; grupos: string[] }) {
  const [q, setQ] = useState("");
  const consulta = q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  const visibles = useMemo(
    () => (consulta ? guias.filter((g) => consulta.split(/\s+/).every((p) => g.texto.includes(p))) : guias),
    [consulta, guias],
  );

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Label htmlFor="buscarManual" className="sr-only">
          Buscar en el manual
        </Label>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id="buscarManual" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: crear cita, anular tratamiento, Bold…" className="pl-8" />
      </div>
      {visibles.length === 0 ? <p className="text-sm text-muted-foreground">No encontramos guías con esas palabras.</p> : null}
      {grupos.map((grupo) => {
        const delGrupo = visibles.filter((g) => g.grupo === grupo);
        if (!delGrupo.length) return null;
        return (
          <section key={grupo} className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{grupo}</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {delGrupo.map((g) => {
                return (
                  <li key={g.slug}>
                    <Link href={`/manual/${g.slug}`} className="flex h-full gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-muted/40">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-accent-foreground">
                        <IconoGuia nombre={g.icono} className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">{g.titulo}</span>
                        <span className="block text-sm text-muted-foreground">{g.resumen}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
