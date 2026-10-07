"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { MenuIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger } from "@/components/ui/dialog";

import { NavBadge, type NavItem } from "./nav-group";

type NavGroup = { label: string; items: NavItem[] };

// Mismo <Dialog> que el resto de la app (overlay + cierre solo por X, nunca
// click-afuera/Escape — ver components/ui/dialog.tsx), pero con un Popup
// propio posicionado como panel lateral en vez del modal centrado de
// DialogContent. Reutiliza el enforcement de cierre sin duplicarlo.
export function MobileNav({
  groups,
  nombreUsuario,
  rolUsuario,
  logoutAction,
}: {
  groups: NavGroup[];
  nombreUsuario: string;
  rolUsuario?: string;
  logoutAction: (formData: FormData) => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const totalBadges = groups.reduce((n, g) => n + g.items.reduce((m, i) => m + (i.badge ?? 0), 0), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="relative md:hidden" aria-label="Abrir menú">
            <MenuIcon />
            {totalBadges > 0 ? <NavBadge n={totalBadges} className="absolute -top-1 -right-1" /> : null}
          </Button>
        }
      />
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="mobile-nav-panel"
          className="fixed inset-y-0 right-0 z-50 flex h-full w-72 max-w-[85vw] flex-col gap-1 bg-popover p-4 text-sm text-popover-foreground shadow-xl outline-none data-open:animate-in data-open:slide-in-from-right data-open:duration-200 data-closed:animate-out data-closed:slide-out-to-right data-closed:duration-150"
        >
          <DialogPrimitive.Title className="sr-only">Menú de navegación</DialogPrimitive.Title>
          <div className="mb-3 flex items-start justify-between gap-2 border-b pb-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{nombreUsuario}</p>
              {rolUsuario ? (
                <p className="truncate text-xs text-muted-foreground">{rolUsuario}</p>
              ) : null}
            </div>
            <DialogClose
              render={<Button variant="ghost" size="icon-sm" aria-label="Cerrar menú" />}
            >
              <XIcon />
            </DialogClose>
          </div>

          <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
            {groups.map((grupo) => (
              <div key={grupo.label} className="flex flex-col gap-1">
                <p className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {grupo.label}
                </p>
                {grupo.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                      pathname.startsWith(item.href) && "bg-muted text-foreground",
                    )}
                  >
                    {item.label}
                    {item.badge ? <NavBadge n={item.badge} /> : null}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <form action={logoutAction} className="border-t pt-3">
            <DialogClose
              render={<Button type="submit" variant="outline" size="sm" className="w-full" />}
            >
              Salir
            </DialogClose>
          </form>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
