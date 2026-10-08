"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SECCIONES_FINANZAS } from "@/lib/finanzas/constantes";

function esActiva(pathname: string, href: string) {
  return href === "/finanzas" ? pathname === href : pathname.startsWith(href);
}

// Mismo patrón que la subnavegación de Habilitación: píldoras en escritorio,
// un menú con la sección actual en móvil. Las secciones de fases futuras se
// ven sin enlace.
export function FinanzasNav() {
  const pathname = usePathname();
  const actual = SECCIONES_FINANZAS.find((s) => esActiva(pathname, s.href)) ?? SECCIONES_FINANZAS[0];
  return (
    <nav aria-label="Secciones del flujo de caja">
      <div className="hidden max-w-full overflow-x-auto md:block">
        <ul className="inline-flex h-11 items-center gap-0.5 rounded-xl bg-muted p-1">
          {SECCIONES_FINANZAS.map((s) => (
            <li key={s.href}>
              {s.disponible ? (
                <Link
                  href={s.href}
                  aria-current={esActiva(pathname, s.href) ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors hover:text-foreground",
                    esActiva(pathname, s.href) && "bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground",
                  )}
                >
                  {s.label}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  title="Disponible próximamente"
                  className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap text-foreground/35"
                >
                  {s.label}
                  <span className="rounded-full bg-background/70 px-1.5 text-[0.65rem] font-semibold tracking-wide uppercase">Pronto</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
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
            {SECCIONES_FINANZAS.filter((s) => s.disponible).map((s) => (
              <DropdownMenuItem key={s.href} render={<Link href={s.href} />} className={cn(esActiva(pathname, s.href) && "bg-accent")}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
