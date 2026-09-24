import Link from "next/link";
import { LockIcon } from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { REGISTRO_MODULOS } from "@/lib/modulos/registro";

export default async function DashboardPage() {
  const usuario = await requireUsuario();
  const supabase = await createClient();

  const chequeos = await Promise.all(
    REGISTRO_MODULOS.map(async (modulo) => {
      const [{ data: puedeVer }, { data: tieneEntitlement }] = await Promise.all([
        supabase.rpc("has_permission", { modulo_code: modulo.codigo, permiso_code: "VIEW" }),
        supabase.rpc("has_entitlement", { modulo_code: modulo.codigo }),
      ]);
      return { modulo, puedeVer: !!puedeVer, tieneEntitlement: !!tieneEntitlement };
    }),
  );

  const modulosVisibles = chequeos.filter((c) => c.puedeVer);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Hola, {usuario.nombre}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Correo: {usuario.email}</p>
          <p>Rol: {usuario.roles?.nombre}</p>
        </CardContent>
      </Card>

      {modulosVisibles.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modulosVisibles.map(({ modulo, tieneEntitlement }) => {
            const Icono = modulo.icono;
            return (
              <Link
                key={modulo.codigo}
                href={modulo.href}
                className="relative block cursor-pointer space-y-3 rounded-xl border p-6 transition hover:border-primary/40 hover:shadow-sm"
              >
                {!tieneEntitlement ? (
                  <Badge className="absolute top-3 right-3 border border-primary/20 bg-primary/10 px-1.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                    Pro
                  </Badge>
                ) : null}

                <div
                  className={`relative flex size-14 items-center justify-center rounded-full ${
                    tieneEntitlement ? "bg-primary/10" : "bg-[#363F4A]/10"
                  }`}
                >
                  <Icono
                    className={`size-6 ${tieneEntitlement ? "text-primary" : "text-[#363F4A]"}`}
                  />
                  {!tieneEntitlement ? (
                    <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-primary">
                      <LockIcon className="size-3 text-primary-foreground" />
                    </span>
                  ) : null}
                </div>

                <div>
                  <p className="text-base font-semibold">{modulo.nombre}</p>
                  <p className="text-sm text-muted-foreground">{modulo.descripcion}</p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
