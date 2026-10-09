import Link from "next/link";
import { ArrowRightIcon, CircleAlertIcon, LockIcon, WandSparklesIcon } from "lucide-react";
import { esAdministrador, requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { REGISTRO_MODULOS } from "@/lib/modulos/registro";
import { Button } from "@/components/ui/button";
import { leerConfiguracion } from "@/lib/configuracion/estado";
import { resumirConfiguracion } from "@/lib/configuracion/lista";

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
  // Lo que le falta a la clínica, del asistente de configuración (solo administradores).
  const config = esAdministrador(usuario) ? await leerConfiguracion(usuario.clinica_id) : null;
  const resumen = config ? resumirConfiguracion(config.modulos) : null;
  const pendientes = config
    ? config.modulos.flatMap((m) => m.puntos.filter((p) => p.tipo === "obligatorio" && p.estado === "pendiente").map((p) => ({ ...p, modulo: m.titulo })))
    : [];
  const unicos = pendientes.filter((p, i) => pendientes.findIndex((x) => x.id === p.id) === i);

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

      {resumen && resumen.faltan > 0 ? (
        <Card className="border-primary/40 bg-accent/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WandSparklesIcon className="size-5 text-primary" /> Configura tu clínica
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {resumen.faltan === 1 ? "Te falta 1 cosa esencial" : `Te faltan ${resumen.faltan} cosas esenciales`} para que todos tus módulos funcionen completos.
              El asistente te guía paso a paso y te dice qué afecta cada una.
            </p>
            <ul className="space-y-1.5">
              {unicos.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-start gap-2">
                  <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                  <span>
                    {p.titulo} <span className="text-muted-foreground">· {p.modulo}</span>
                  </span>
                </li>
              ))}
              {unicos.length > 4 ? <li className="pl-6 text-muted-foreground">Y {unicos.length - 4} más.</li> : null}
            </ul>
            <Button render={<Link href="/configuracion-clinica?paso=1" />}>
              Abrir el asistente de configuración <ArrowRightIcon />
            </Button>
          </CardContent>
        </Card>
      ) : resumen && resumen.recomendados > 0 ? (
        <Link
          href="/configuracion-clinica"
          className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors hover:bg-muted/60"
        >
          <WandSparklesIcon className="size-5 shrink-0 text-primary" />
          <span className="flex-1">
            Tu clínica tiene lo esencial. Hay {resumen.recomendados} {resumen.recomendados === 1 ? "sugerencia" : "sugerencias"} para aprovecharla mejor.
          </span>
          <ArrowRightIcon className="size-4 text-muted-foreground" />
        </Link>
      ) : null}

      {modulosVisibles.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modulosVisibles.map(({ modulo, tieneEntitlement }) => {
            const Icono = modulo.icono;
            return (
              <Link
                key={modulo.codigo}
                href={modulo.href}
                transitionTypes={["module-switch"]}
                className="relative block cursor-pointer space-y-3 rounded-xl border p-6 transition duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
