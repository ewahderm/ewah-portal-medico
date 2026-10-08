import Link from "next/link";
import { ArrowRightIcon, BanknoteIcon, CreditCardIcon, HandCoinsIcon, LandmarkIcon, SmartphoneIcon, TriangleAlertIcon, WalletIcon, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoFinanzas, getConfigFinanzas, getCuentas, getSocios } from "@/lib/finanzas/consultas";
import { resumirCuentas } from "@/lib/finanzas/cuentas";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { TIPOS_CUENTA, etiqueta, type TipoCuenta } from "@/lib/finanzas/constantes";
import { hoyBogota } from "@/lib/habilitacion/servidor";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AsistenteArranque } from "./asistente-arranque";

const ICONOS: Record<TipoCuenta, LucideIcon> = {
  banco: LandmarkIcon,
  nequi: SmartphoneIcon,
  daviplata: SmartphoneIcon,
  efectivo: BanknoteIcon,
  pasarela: CreditCardIcon,
  tarjeta_socio: HandCoinsIcon,
};

// FC1: asistente de arranque (sin configuración) o tablero de saldos. Los
// movimientos llegan en FC2; mientras tanto el saldo es el inicial.
export default async function FinanzasPage() {
  await requireUsuario();
  const acceso = await getAccesoFinanzas();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver el flujo de caja.</AlertDescription>
      </Alert>
    );
  }
  const supabase = await createClient();
  const config = await getConfigFinanzas(supabase);
  if (config === undefined) {
    return (
      <Alert>
        <TriangleAlertIcon />
        <AlertDescription>El flujo de caja se está terminando de instalar en tu cuenta. Vuelve a intentarlo en unos minutos.</AlertDescription>
      </Alert>
    );
  }
  if (config === null) {
    return acceso.puedeEditar ? (
      <AsistenteArranque hoy={hoyBogota()} gestion={acceso.gestion} />
    ) : (
      <Alert>
        <AlertDescription>El flujo de caja aún no está activado. Pide a un administrador que lo configure.</AlertDescription>
      </Alert>
    );
  }

  const [cuentas, socios] = await Promise.all([getCuentas(supabase), getSocios(supabase)]);
  const activas = cuentas.filter((c) => c.activa);
  const resumen = resumirCuentas(activas.map((c) => ({ ...c, saldo: c.saldo_inicial })));
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]));

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          Llevas la caja desde el <strong>{fechaLegible(config.fecha_inicio)}</strong>. Por ahora ves los saldos iniciales; muy pronto
          podrás registrar lo que entra y lo que sale.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cifra icono={WalletIcon} titulo="Disponible en pesos" valor={formatoDinero(resumen.disponible.COP)} detalle="Bancos, billeteras y efectivo" />
        {resumen.disponible.USD || resumen.disponible.EUR ? (
          <Cifra
            icono={BanknoteIcon}
            titulo="Disponible en divisas"
            valor={[resumen.disponible.USD ? formatoDinero(resumen.disponible.USD, "USD") : null, resumen.disponible.EUR ? formatoDinero(resumen.disponible.EUR, "EUR") : null].filter(Boolean).join(" · ")}
            detalle="Efectivo en dólares y euros"
          />
        ) : null}
        {activas.some((c) => c.tipo === "pasarela") ? (
          <Cifra icono={CreditCardIcon} titulo="Por abonar (pasarela)" valor={formatoDinero(resumen.porAbonar)} detalle="Cobros con tarjeta que aún no llegan" />
        ) : null}
        {activas.some((c) => c.tipo === "tarjeta_socio") ? (
          <Cifra
            icono={HandCoinsIcon}
            titulo="Se les debe a los socios"
            valor={formatoDinero(resumen.deudaSocios)}
            detalle="Gastos pagados con sus tarjetas"
            tono={resumen.deudaSocios > 0 ? "alerta" : undefined}
          />
        ) : null}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">Cuentas</CardTitle>
          {acceso.puedeEditar ? (
            <Link href="/finanzas/configuracion?tab=cuentas" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
              Administrar <ArrowRightIcon className="size-4" />
            </Link>
          ) : null}
        </CardHeader>
        <CardContent>
          {activas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay cuentas activas.</p>
          ) : (
            <ul className="divide-y">
              {activas.map((c) => {
                const Icono = ICONOS[c.tipo];
                const deuda = c.tipo === "tarjeta_socio";
                return (
                  <li key={c.id} className="flex items-center gap-3 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-accent-foreground">
                      <Icono className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.nombre}</span>
                      <span className="block text-xs text-muted-foreground">
                        {etiqueta(TIPOS_CUENTA, c.tipo)}
                        {deuda && c.socio_id ? ` · ${nombreSocio.get(c.socio_id) ?? ""}` : ""}
                        {c.ultimos_digitos ? ` · ****${c.ultimos_digitos}` : ""}
                      </span>
                    </span>
                    <span className={cn("text-right text-sm font-semibold tabular-nums", deuda && c.saldo_inicial < 0 && "text-destructive")}>
                      {deuda ? (c.saldo_inicial < 0 ? `Se le debe ${formatoDinero(-c.saldo_inicial)}` : "Al día") : formatoDinero(c.saldo_inicial, c.moneda)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Cifra({ icono: Icono, titulo, valor, detalle, tono }: { icono: LucideIcon; titulo: string; valor: string; detalle: string; tono?: "alerta" }) {
  return (
    <div className="flex h-full items-start gap-3 rounded-lg border bg-card p-3">
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", tono === "alerta" ? "bg-amber-50 text-amber-700" : "bg-primary/10 text-accent-foreground")}>
        <Icono className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={cn("text-xl font-semibold tabular-nums", tono === "alerta" && "text-amber-700")}>{valor}</p>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </div>
    </div>
  );
}
