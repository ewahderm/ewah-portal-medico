import Link from "next/link";
import { ViewTransition } from "react";
import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { EwahLogo } from "@/components/ewah-logo";
import { MobileNav } from "./_components/mobile-nav";
import { NavGroup } from "./_components/nav-group";

type EntradaNavegacion = {
  href: string;
  label: string;
  modulo?: string;
  requiere?: string[];
  badge?: number;
};

type GrupoNavegacion = {
  label: string;
  direct?: boolean;
  items: EntradaNavegacion[];
};

const NAV_GROUPS: GrupoNavegacion[] = [
  {
    label: "Inicio",
    direct: true,
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/reportes", label: "Reportes", modulo: "reportes" },
    ],
  },
  {
    label: "Atención",
    items: [
      { href: "/citas", label: "Agenda", modulo: "citas" },
      { href: "/pacientes", label: "Pacientes", modulo: "pacientes" },
      { href: "/tratamientos", label: "Tratamientos", modulo: "tratamientos" },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/inventario", label: "Inventario", modulo: "inventario" },
      { href: "/finanzas", label: "Flujo de caja", modulo: "finanzas" },
      { href: "/rrhh", label: "Recursos Humanos", modulo: "rrhh" },
    ],
  },
  {
    label: "Relación",
    items: [
      { href: "/campanas", label: "Campañas", modulo: "campanas" },
    ],
  },
  {
    label: "Cumplimiento",
    items: [
      { href: "/medio-ambiente", label: "Medio Ambiente", modulo: "medio_ambiente" },
      { href: "/habilitacion", label: "Habilitación", modulo: "habilitacion" },
      { href: "/sst", label: "SG-SST", modulo: "sst" },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/usuarios", label: "Usuarios", modulo: "usuarios" },
      { href: "/parametros", label: "Parámetros", modulo: "parametros" },
      { href: "/suscripcion", label: "Suscripción", modulo: "suscripcion" },
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

// Insignia de SG-SST (F8): accidentes por reportar, investigaciones y
// acciones vencidas, solo con sst/VIEW. Mismo criterio de errores.
async function contarUrgentesSst(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { data: puedeVer } = await supabase.rpc("has_permission", { modulo_code: "sst", permiso_code: "VIEW" });
  if (!puedeVer) return 0;
  const { data, error } = await supabase.rpc("fn_sst_conteo_urgentes");
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
  const [{ data: esSuperAdmin }, { data: modulosDisponibles, error: errorModulos }, urgentesHabilitacion, urgentesSst] = await Promise.all([
    supabaseSesion.rpc("es_super_admin"),
    supabaseSesion.rpc("fn_modulos_nav_visibles"),
    contarUrgentesHabilitacion(supabaseSesion),
    contarUrgentesSst(supabaseSesion),
  ]);
  // El filtro del menú es conveniencia, no seguridad: cada página vuelve a
  // exigir su permiso. Si la RPC falla (o la migración 0084 aún no está
  // aplicada) se muestra el menú completo, como antes, en vez de tumbar
  // todas las pantallas protegidas.
  if (errorModulos) console.error("[nav] fn_modulos_nav_visibles", errorModulos);
  const codigosVisibles = errorModulos
    ? null
    : new Set<string>((modulosDisponibles ?? []).map((modulo: { codigo: string }) => modulo.codigo));
  const navGroups = NAV_GROUPS
    .map((grupo) => ({
      ...grupo,
      items: grupo.items
        .filter((item) => !item.modulo || !codigosVisibles || [item.modulo, ...(item.requiere ?? [])].every((codigo) => codigosVisibles.has(codigo)))
        .map((item) => {
          const menuItem = { href: item.href, label: item.label };
          return item.href === "/sst" && urgentesSst > 0
            ? { ...menuItem, badge: urgentesSst }
            : item.href === "/habilitacion" && urgentesHabilitacion > 0
              ? { ...menuItem, badge: urgentesHabilitacion }
              : menuItem;
        }),
    }))
    .filter((grupo) => grupo.items.length > 0)
    .map((grupo) => grupo.label === "Administración"
      ? {
          ...grupo,
          items: [
            ...grupo.items,
            ...(esAdministrador(usuario) ? [{ href: "/exportar", label: "Exportar datos" }] : []),
          ],
        }
      : grupo)
    .concat(esSuperAdmin ? [{ label: "Plataforma", direct: false, items: [{ href: "/plataforma", label: "Plataforma" }] }] : [])
    // Siempre al final del menú, a la vista de todos los roles.
    .concat([{ label: "Documentación", direct: true, items: [{ href: "/manual", label: "Documentación" }] }]);

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
            <Link href="/dashboard" transitionTypes={["module-switch"]}>
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
            {/* Menú de escritorio desde xl (1280 px): con 2 enlaces + 5 grupos
                + el logo (máx. 210 px) cabe con gap-1; por debajo, el menú
                lateral con los mismos grupos (SPEC-navegacion-motion). */}
            <div className="hidden items-center gap-1 xl:flex">
              {navGroups.map((grupo) => (
                <NavGroup key={grupo.label} label={grupo.label} items={grupo.items} direct={grupo.direct} />
              ))}
            </div>
          </nav>
          <div className="hidden items-center gap-4 text-sm xl:flex">
            {/* El nombre solo desde 2xl: entre 1280 y 1536 px no cabe junto a
                los grupos; sigue visible en el menú lateral. */}
            <span className="hidden text-muted-foreground 2xl:inline">
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
      <main className="mx-auto w-full max-w-[1536px] flex-1 px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">
        <ViewTransition update={{ "module-switch": "module-switch", default: "none" }} default="none">
          {children}
        </ViewTransition>
      </main>
    </div>
  );
}
