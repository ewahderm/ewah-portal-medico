"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon, LockIcon } from "lucide-react";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SECCIONES_HABILITACION } from "@/lib/habilitacion/constantes";

// Resumen solo está activo en /habilitacion exacto; el resto por prefijo.
function esActiva(pathname: string, href: string) {
  return href === "/habilitacion" ? pathname === href : pathname.startsWith(href);
}

// Secciones de fases futuras: visibles (el usuario ve el camino completo)
// pero sin enlace — nunca una ruta rota. Las de pago en Gratis llevan un
// candado pequeño y sí enlazan: la página muestra el upsell.
export function HabilitacionNav({ gestion }: { gestion: boolean }) {
  const pathname = usePathname();
  const actual = SECCIONES_HABILITACION.find((s) => esActiva(pathname, s.href)) ?? SECCIONES_HABILITACION[0];

  return (
    <nav aria-label="Secciones de Habilitación">
      {/* Escritorio: píldoras (mismo look que components/ui/tabs). */}
      <div className="hidden max-w-full overflow-x-auto md:block">
        <ul className="inline-flex h-11 items-center gap-0.5 rounded-xl bg-muted p-1">
          {SECCIONES_HABILITACION.map((s) => {
            const activa = esActiva(pathname, s.href);
            const bloqueada = s.gestion && !gestion;
            if (!s.disponible) {
              return (
                <li key={s.href}>
                  <span
                    aria-disabled="true"
                    title="Disponible próximamente"
                    className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap text-foreground/35"
                  >
                    {s.label}
                    <span className="rounded-full bg-background/70 px-1.5 text-[0.65rem] font-semibold tracking-wide uppercase">
                      Pronto
                    </span>
                  </span>
                </li>
              );
            }
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={activa ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors hover:text-foreground",
                    activa && "bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground",
                  )}
                >
                  {s.label}
                  {bloqueada ? <LockIcon className="size-3.5" aria-label="Plan Pro" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Móvil: un solo botón con la sección actual y el resto en un menú
          (7 píldoras no caben en 390 px sin esconder la activa). */}
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-11 w-full items-center justify-between rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground outline-none">
            <span>
              <span className="font-normal opacity-70">Sección: </span>
              {actual.label}
            </span>
            <ChevronDownIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--anchor-width)">
            {SECCIONES_HABILITACION.map((s) =>
              s.disponible ? (
                <DropdownMenuItem
                  key={s.href}
                  render={<Link href={s.href} />}
                  className={cn(esActiva(pathname, s.href) && "bg-accent text-accent-foreground")}
                >
                  {s.label}
                  {s.gestion && !gestion ? <LockIcon className="ml-auto size-3.5" aria-label="Plan Pro" /> : null}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem key={s.href} disabled>
                  {s.label}
                  <span className="ml-auto text-[0.65rem] font-semibold tracking-wide uppercase">Pronto</span>
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
