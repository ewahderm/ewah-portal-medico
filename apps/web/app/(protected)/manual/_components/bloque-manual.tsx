import Image from "next/image";
import { InfoIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import type { Bloque } from "@/lib/manual";
import { cn } from "cn";
import { TextoManual } from "./texto-manual";

const NOTAS = {
  info: { icono: InfoIcon, clase: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100", titulo: "Bueno saber" },
  pro: { icono: SparklesIcon, clase: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100", titulo: "Plan Pro" },
  aviso: { icono: TriangleAlertIcon, clase: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100", titulo: "Atención" },
} as const;

export function BloqueManual({ bloque: b }: { bloque: Bloque }) {
  switch (b.tipo) {
    case "texto":
      return (
        <p className="leading-relaxed">
          <TextoManual texto={b.texto} />
        </p>
      );
    case "pasos":
      return (
        <ol className="space-y-2">
          {b.pasos.map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
              <span className="pt-0.5 leading-relaxed">
                <TextoManual texto={p} />
              </span>
            </li>
          ))}
        </ol>
      );
    case "lista":
      return (
        <ul className="list-disc space-y-1 pl-5 leading-relaxed marker:text-muted-foreground">
          {b.items.map((t, i) => (
            <li key={i}>
              <TextoManual texto={t} />
            </li>
          ))}
        </ul>
      );
    case "imagen":
      return (
        <figure className="space-y-2">
          <a href={`/manual/${b.archivo}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border shadow-sm" title="Ver en tamaño completo">
            <Image src={`/manual/${b.archivo}`} alt={b.alt} width={1280} height={800} sizes="(min-width: 1024px) 768px, 100vw" className="h-auto w-full" />
          </a>
          {b.pie ? (
            <figcaption className="text-xs text-muted-foreground">
              <TextoManual texto={b.pie} />
            </figcaption>
          ) : null}
        </figure>
      );
    case "nota": {
      const n = NOTAS[b.tono];
      const Icono = n.icono;
      return (
        <div className={cn("flex gap-3 rounded-lg border p-3 text-sm", n.clase)}>
          <Icono className="mt-0.5 size-4 shrink-0" />
          <p className="leading-relaxed">
            <strong>{n.titulo}: </strong>
            <TextoManual texto={b.texto} />
          </p>
        </div>
      );
    }
  }
}
