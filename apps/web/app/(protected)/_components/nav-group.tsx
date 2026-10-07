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

export function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  const activo = items.some((item) => pathname.startsWith(item.href));
  const totalBadges = items.reduce((n, item) => n + (item.badge ?? 0), 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1 text-muted-foreground outline-none hover:text-foreground data-popup-open:text-foreground",
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
            render={<Link href={item.href} />}
            className={cn(
              "justify-between gap-3 whitespace-nowrap",
              pathname.startsWith(item.href) && "bg-accent text-accent-foreground",
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
