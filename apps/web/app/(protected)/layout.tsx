import Link from "next/link";
import { requireUsuario } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { EwahLogo } from "@/components/ewah-logo";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await requireUsuario();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/dashboard">
              <EwahLogo variant="dark" />
            </Link>
            <Link href="/pacientes" className="text-muted-foreground hover:text-foreground">
              Pacientes
            </Link>
            <Link href="/tratamientos" className="text-muted-foreground hover:text-foreground">
              Tratamientos
            </Link>
            <Link href="/citas" className="text-muted-foreground hover:text-foreground">
              Agenda
            </Link>
            <Link href="/inventario" className="text-muted-foreground hover:text-foreground">
              Inventario
            </Link>
            <Link href="/usuarios" className="text-muted-foreground hover:text-foreground">
              Usuarios
            </Link>
            <Link href="/parametros" className="text-muted-foreground hover:text-foreground">
              Parámetros
            </Link>
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {usuario.nombre} · {usuario.roles?.nombre}
            </span>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
