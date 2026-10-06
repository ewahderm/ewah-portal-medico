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

export type NavItem = { href: string; label: string };

export function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  const activo = items.some((item) => pathname.startsWith(item.href));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1 text-muted-foreground outline-none hover:text-foreground data-popup-open:text-foreground",
          activo && "text-foreground",
        )}
      >
        {label}
        <ChevronDownIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-48">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.href}
            render={<Link href={item.href} />}
            className={cn(
              "whitespace-nowrap",
              pathname.startsWith(item.href) && "bg-accent text-accent-foreground",
            )}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
