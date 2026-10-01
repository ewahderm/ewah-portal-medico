import Link from "next/link";
import { requireUsuario } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { EwahLogo } from "@/components/ewah-logo";
import { MobileNav } from "./_components/mobile-nav";

const NAV_ITEMS = [
  { href: "/pacientes", label: "Pacientes" },
  { href: "/tratamientos", label: "Tratamientos" },
  { href: "/citas", label: "Agenda" },
  { href: "/inventario", label: "Inventario" },
  { href: "/campanas", label: "Campañas" },
  { href: "/medio-ambiente", label: "Medio Ambiente" },
  { href: "/usuarios", label: "Usuarios" },
  { href: "/parametros", label: "Parámetros" },
  { href: "/suscripcion", label: "Suscripción" },
];

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await requireUsuario();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b print:hidden">
        <div className="mx-auto flex max-w-[1536px] items-center justify-between px-6 py-4">
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/dashboard">
              <EwahLogo variant="dark" />
            </Link>
            <div className="hidden items-center gap-6 md:flex">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
          <div className="hidden items-center gap-4 text-sm md:flex">
            <span className="text-muted-foreground">
              {usuario.nombre} · {usuario.roles?.nombre}
            </span>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Salir
              </Button>
            </form>
          </div>
          <MobileNav
            items={NAV_ITEMS}
            nombreUsuario={usuario.nombre}
            rolUsuario={usuario.roles?.nombre}
            logoutAction={logout}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1536px] flex-1 px-6 py-8 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  );
}
