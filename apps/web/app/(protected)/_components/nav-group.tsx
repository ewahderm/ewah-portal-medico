"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export type NavItem = { href: string; label: string; badge?: number };

// Insignia numérica (p. ej. pendientes urgentes de Habilitación). El
// texto para lectores de pantalla va aparte del número.
export function NavBadge({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] leading-none font-semibold text-white tabular-nums",
        className,
      )}
    >
      {n > 99 ? "99+" : n}
      <span className="sr-only"> pendientes urgentes</span>
    </span>
  );
}

export function NavGroup({ label, items, direct = false }: { label: string; items: NavItem[]; direct?: boolean }) {
  const pathname = usePathname();
  const activo = items.some((item) => pathname.startsWith(item.href));
  const totalBadges = items.reduce((n, item) => n + (item.badge ?? 0), 0);

  if (direct) {
    return (
      <div className="flex items-center gap-1">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              transitionTypes={["module-switch"]}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isActive && "bg-accent text-accent-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "relative flex items-center gap-1 rounded-md px-2.5 py-2 text-muted-foreground outline-none transition-colors hover:bg-muted/70 hover:text-foreground motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring data-popup-open:text-foreground",
          activo && "text-foreground",
        )}
      >
        {label}
        {totalBadges > 0 ? <NavBadge n={totalBadges} /> : null}
        <ChevronDownIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-48">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.href}
            render={<Link href={item.href} transitionTypes={["module-switch"]} aria-current={pathname.startsWith(item.href) ? "page" : undefined} />}
            className={cn(
              "justify-between gap-3 whitespace-nowrap",
              pathname.startsWith(item.href) && "bg-accent text-accent-foreground before:absolute before:inset-y-1 before:left-1 before:w-0.5 before:rounded-full before:bg-primary",
            )}
          >
            {item.label}
            {item.badge ? <NavBadge n={item.badge} /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
