import Link from "next/link";
import { requireUsuario } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // es_super_admin() depende de auth.uid(), así que necesita el cliente de
  // sesión (no el admin) — es la bandera cross-tenant del equipo de EWAH
  // Tech, nunca asignable desde ninguna pantalla de la app.
  const supabaseSesion = await createClient();
  const { data: esSuperAdmin } = await supabaseSesion.rpc("es_super_admin");
  const navItems = esSuperAdmin
    ? [...NAV_ITEMS, { href: "/plataforma", label: "Plataforma" }]
    : NAV_ITEMS;

  // Cliente admin a propósito, no el de sesión: clinica_actual() (y por lo
  // tanto la policy de select normal) ahora exige clinicas.activo = true —
  // si la clínica se desactivó mientras este usuario ya tenía sesión
  // abierta, una consulta con RLS normal no devolvería la fila y no
  // podríamos distinguir "sin logo" de "clínica desactivada". Sigue sin
  // riesgo cross-tenant: el filtro es por el id ya resuelto de la sesión.
  const admin = createAdminClient();
  const { data: clinica } = await admin
    .from("clinicas")
    .select("nombre, nombre_comercial, logo_storage_path, activo")
    .eq("id", usuario.clinica_id)
    .maybeSingle();

  if (clinica && !clinica.activo) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-xl">
          <h2 className="text-xl font-bold tracking-tight">Clínica desactivada</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            El acceso de tu clínica fue desactivado. Contacta a EWAH Tech para reactivarlo.
          </p>
          <form action={logout} className="mt-6">
            <Button type="submit" variant="outline" className="w-full">
              Salir
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // El logo de la clínica es la marca que el staff ve todo el día — EWAH
  // Tech se queda como respaldo mientras no hayan subido uno (Suscripción)
  // y sigue siendo la identidad de las pantallas públicas (login/signup).
  const logoClinicaUrl = clinica?.logo_storage_path
    ? admin.storage.from("clinica-logos").getPublicUrl(clinica.logo_storage_path).data.publicUrl
    : null;
  const nombreClinica = clinica?.nombre_comercial || clinica?.nombre || "Tu clínica";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b print:hidden">
        <div className="mx-auto flex max-w-[1536px] items-center justify-between px-6 py-4">
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/dashboard">
              {logoClinicaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoClinicaUrl}
                  alt={nombreClinica}
                  className="h-[42px] max-w-[210px] object-contain"
                />
              ) : (
                <EwahLogo variant="dark" />
              )}
            </Link>
            <div className="hidden items-center gap-6 md:flex">
              {navItems.map((item) => (
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
            items={navItems}
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
