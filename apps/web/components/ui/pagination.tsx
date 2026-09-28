"use client";

import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "./button";

// Dos formas de usarse, según si quien pagina es un Server Component (la
// URL manda, ej. Pacientes/Tratamientos) o un Client Component que ya
// mantiene sus propios filtros en estado y pide cada página a una server
// action (ej. Movimientos de Inventario). Nunca los dos modos a la vez.
type PaginationLinkProps = {
  pagina: number;
  totalPaginas: number;
  basePath: string;
  parametros?: Record<string, string | undefined>;
  onCambiarPagina?: never;
};

type PaginationCallbackProps = {
  pagina: number;
  totalPaginas: number;
  onCambiarPagina: (pagina: number) => void;
  basePath?: never;
  parametros?: never;
};

type PaginationProps = PaginationLinkProps | PaginationCallbackProps;

export function Pagination(props: PaginationProps) {
  const { pagina, totalPaginas } = props;
  if (totalPaginas <= 1) return null;

  const hayAnterior = pagina > 1;
  const haySiguiente = pagina < totalPaginas;

  function href(basePath: string, parametros: Record<string, string | undefined> | undefined, destino: number) {
    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries(parametros ?? {})) {
      if (valor) params.set(clave, valor);
    }
    params.set("page", String(destino));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <p className="text-xs text-muted-foreground">
        Página {pagina} de {totalPaginas}
      </p>
      <div className="flex gap-2">
        {"onCambiarPagina" in props && props.onCambiarPagina ? (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!hayAnterior}
              onClick={() => props.onCambiarPagina(pagina - 1)}
            >
              <ChevronLeftIcon /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!haySiguiente}
              onClick={() => props.onCambiarPagina(pagina + 1)}
            >
              Siguiente <ChevronRightIcon />
            </Button>
          </>
        ) : (
          <>
            {hayAnterior ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={href(props.basePath, props.parametros, pagina - 1)} />}
              >
                <ChevronLeftIcon /> Anterior
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <ChevronLeftIcon /> Anterior
              </Button>
            )}
            {haySiguiente ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={href(props.basePath, props.parametros, pagina + 1)} />}
              >
                Siguiente <ChevronRightIcon />
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Siguiente <ChevronRightIcon />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
