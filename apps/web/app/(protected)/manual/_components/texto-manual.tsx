import { Fragment } from "react";

// Formato mínimo del manual: **negrita** y `botón o campo` (se muestra como
// la etiqueta que el usuario ve en pantalla).
export function TextoManual({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {partes.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`"))
          return (
            <span key={i} className="rounded border bg-muted px-1 py-px text-[0.9em] font-medium whitespace-nowrap">
              {p.slice(1, -1)}
            </span>
          );
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
