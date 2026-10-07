import Link from "next/link";
import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { EwahLogo } from "@/components/ewah-logo";
import { MobileNav } from "./_components/mobile-nav";
import { NavGroup } from "./_components/nav-group";

const NAV_GROUPS = [
  {
    label: "Clínico",
    items: [
      { href: "/pacientes", label: "Pacientes" },
      { href: "/tratamientos", label: "Tratamientos" },
      { href: "/citas", label: "Agenda" },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/inventario", label: "Inventario" },
      { href: "/campanas", label: "Campañas" },
      { href: "/medio-ambiente", label: "Medio Ambiente" },
      { href: "/rrhh", label: "Recursos Humanos" },
      { href: "/sst", label: "SG-SST" },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/usuarios", label: "Usuarios" },
      { href: "/parametros", label: "Parámetros" },
      { href: "/habilitacion", label: "Habilitación" },
      { href: "/suscripcion", label: "Suscripción" },
    ],
  },
];

// Insignia de Habilitación (§4.4): vencidas + ≤ 7 días + documentos
// vencidos, solo si el usuario tiene habilitacion/VIEW. Todos los planes.
// Cualquier error (p. ej. la migración aún no aplicada) = sin insignia.
async function contarUrgentesHabilitacion(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { data: puedeVer } = await supabase.rpc("has_permission", { modulo_code: "habilitacion", permiso_code: "VIEW" });
  if (!puedeVer) return 0;
  const { data, error } = await supabase.rpc("fn_hab_conteo_urgentes");
  return error || typeof data !== "number" ? 0 : data;
}

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
  const [{ data: esSuperAdmin }, urgentesHabilitacion] = await Promise.all([
    supabaseSesion.rpc("es_super_admin"),
    contarUrgentesHabilitacion(supabaseSesion),
  ]);
  const navGroups = NAV_GROUPS.map((grupo) =>
    grupo.label === "Administración"
      ? {
          ...grupo,
          items: [
            ...grupo.items.map((item) =>
              item.href === "/habilitacion" && urgentesHabilitacion > 0 ? { ...item, badge: urgentesHabilitacion } : item,
            ),
            ...(esAdministrador(usuario) ? [{ href: "/exportar", label: "Exportar datos" }] : []),
            ...(esSuperAdmin ? [{ href: "/plataforma", label: "Plataforma" }] : []),
          ],
        }
      : grupo,
  );

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
              {navGroups.map((grupo) => (
                <NavGroup key={grupo.label} label={grupo.label} items={grupo.items} />
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
            groups={navGroups}
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
