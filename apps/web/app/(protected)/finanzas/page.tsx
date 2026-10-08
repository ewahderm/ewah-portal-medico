import Link from "next/link";
import { ArrowRightIcon, BanknoteIcon, ClipboardListIcon, CreditCardIcon, HandCoinsIcon, LandmarkIcon, SmartphoneIcon, TriangleAlertIcon, WalletIcon, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoFinanzas, getConfigFinanzas, getDatosRegistro, getIngresosPendientes, getMovimientos } from "@/lib/finanzas/consultas";
import { resumirPendientes } from "@/lib/finanzas/tratamientos";
import { resumirCuentas } from "@/lib/finanzas/cuentas";
import { codigoCategoria, resumirPeriodo } from "@/lib/finanzas/movimientos";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { TIPOS_CUENTA, etiqueta, type TipoCuenta } from "@/lib/finanzas/constantes";
import { hoyBogota } from "@/lib/habilitacion/servidor";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AsistenteArranque } from "./asistente-arranque";
import { RegistrarMovimientoBotones } from "./_components/registrar-movimiento";
import { MovimientoFila } from "./_components/movimiento-fila";

const ICONOS: Record<TipoCuenta, LucideIcon> = {
  banco: LandmarkIcon,
  nequi: SmartphoneIcon,
  daviplata: SmartphoneIcon,
  efectivo: BanknoteIcon,
  pasarela: CreditCardIcon,
  tarjeta_socio: HandCoinsIcon,
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Asistente de arranque (sin configuración) o tablero: saldos por cuenta,
// botones para registrar, entradas y salidas del mes y últimos movimientos.
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
  const hoy = hoyBogota();
  if (config === null) {
    return acceso.puedeEditar ? (
      <AsistenteArranque hoy={hoy} gestion={acceso.gestion} />
    ) : (
      <Alert>
        <AlertDescription>El flujo de caja aún no está activado. Pide a un administrador que lo configure.</AlertDescription>
      </Alert>
    );
  }

  const inicioMes = `${hoy.slice(0, 8)}01`;
  const [datos, delMes, recientes, pendientes] = await Promise.all([
    getDatosRegistro(supabase, acceso, config, hoy),
    getMovimientos(supabase, { desde: inicioMes > config.fecha_inicio ? inicioMes : config.fecha_inicio, hasta: hoy }, 5000),
    getMovimientos(supabase, { desde: config.fecha_inicio, hasta: hoy }, 6),
    getIngresosPendientes(supabase),
  ]);
  const cobros = resumirPendientes(pendientes);
  const atender = cobros.porGenerar.cantidad + cobros.anuladosConIngreso + cobros.porRevisar;
  const resumen = resumirCuentas(datos.cuentas);
  const mes = resumirPeriodo(delMes.map((m) => ({ tipo: m.tipo, categoria: codigoCategoria(m), valor_cop: m.valor_cop, origen: m.origen })));
  const nombreCategoria = new Map(datos.categorias.map((c) => [c.codigo, c.nombre]));
  const nombreCuenta = new Map(datos.cuentas.map((c) => [c.id, c.nombre]));
  const monedaCuenta = new Map(datos.cuentas.map((c) => [c.id, c.moneda]));
  const nombreSocio = new Map(datos.socios.map((s) => [s.id, s.nombre]));
  const maxCategoria = Math.max(1, ...mes.porCategoria.map((c) => c.salidas));
  // Una cuenta inactiva que aún tiene saldo se sigue mostrando (y contando).
  const visibles = datos.cuentas.filter((c) => c.activa || c.saldo !== 0);

  return (
    <div className="space-y-4">
      <RegistrarMovimientoBotones {...datos} puedeCrear={acceso.puedeCrear} />

      {atender ? (
        <Alert>
          <ClipboardListIcon />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {atender === 1 ? "1 tratamiento necesita" : `${atender} tratamientos necesitan`} atención para entrar al flujo de caja
              {cobros.mediosSinCuenta.length ? " (hay medios de pago sin cuenta asignada)" : ""}.
            </span>
            <Link href="/finanzas/cobros" className="inline-flex shrink-0 items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
              Revisar <ArrowRightIcon className="size-4" />
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

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
        {datos.cuentas.some((c) => c.tipo === "pasarela" && (c.activa || c.saldo !== 0)) ? (
          <Cifra icono={CreditCardIcon} titulo="Por abonar (pasarela)" valor={formatoDinero(resumen.porAbonar)} detalle="Cobros con tarjeta que aún no llegan" />
        ) : null}
        {cobros.porCobrar.cantidad ? (
          <Link href="/finanzas/cobros" className="block">
            <Cifra
              icono={ClipboardListIcon}
              titulo="Por cobrar a pacientes"
              valor={formatoDinero(cobros.porCobrar.valor)}
              detalle={`${cobros.porCobrar.cantidad} ${cobros.porCobrar.cantidad === 1 ? "tratamiento" : "tratamientos"} a crédito`}
            />
          </Link>
        ) : null}
        {datos.cuentas.some((c) => c.tipo === "tarjeta_socio" && (c.activa || c.saldo !== 0)) ? (
          <Cifra
            icono={HandCoinsIcon}
            titulo="Se les debe a los socios"
            valor={formatoDinero(resumen.deudaSocios)}
            detalle="Gastos pagados con sus tarjetas"
            tono={resumen.deudaSocios > 0 ? "alerta" : undefined}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {MESES[Number(hoy.slice(5, 7)) - 1][0].toUpperCase() + MESES[Number(hoy.slice(5, 7)) - 1].slice(1)} hasta hoy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-3">
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">Entró</p>
                <p className="font-semibold tabular-nums text-emerald-700">{formatoDinero(mes.entradas)}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">Salió</p>
                <p className="font-semibold tabular-nums text-destructive">{formatoDinero(mes.salidas)}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">Diferencia</p>
                <p className={cn("font-semibold tabular-nums", mes.entradas - mes.salidas < 0 && "text-destructive")}>{formatoDinero(mes.entradas - mes.salidas)}</p>
              </div>
            </div>
            {mes.porCategoria.length ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">En qué se fue la plata</p>
                <ul className="space-y-1.5">
                  {mes.porCategoria.slice(0, 8).map((c) => (
                    <li key={c.categoria} className="space-y-0.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="truncate">{nombreCategoria.get(c.categoria) ?? c.categoria}</span>
                        <span className="shrink-0 tabular-nums">{formatoDinero(c.salidas)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, (c.salidas / maxCategoria) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no hay salidas este mes.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold">Últimos movimientos</CardTitle>
            <Link href="/finanzas/movimientos" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
              Ver todos <ArrowRightIcon className="size-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {recientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay movimientos. Empieza con los botones de arriba.</p>
            ) : (
              <ul className="divide-y">
                {recientes.map((m) => (
                  <MovimientoFila key={m.id} movimiento={m} nombreCategoria={nombreCategoria} nombreCuenta={nombreCuenta} monedaCuenta={monedaCuenta} nombreSocio={nombreSocio} compacta />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
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
          <p className="mb-2 text-xs text-muted-foreground">Llevas la caja desde el {fechaLegible(config.fecha_inicio)}.</p>
          {visibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay cuentas activas.</p>
          ) : (
            <ul className="divide-y">
              {visibles.map((c) => {
                const Icono = ICONOS[c.tipo];
                const deuda = c.tipo === "tarjeta_socio";
                return (
                  <li key={c.id}>
                    <Link href={`/finanzas/movimientos?cuenta=${c.id}`} className="flex items-center gap-3 py-3 hover:bg-muted/50">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-accent-foreground">
                        <Icono className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {c.nombre}
                          {!c.activa ? <span className="ml-1 text-xs font-normal text-muted-foreground">(inactiva)</span> : null}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {etiqueta(TIPOS_CUENTA, c.tipo)}
                          {deuda && c.socio_id ? ` · ${nombreSocio.get(c.socio_id) ?? ""}` : ""}
                        </span>
                      </span>
                      <span className={cn("text-right text-sm font-semibold tabular-nums", (deuda ? c.saldo < 0 : c.saldo < 0) && "text-destructive")}>
                        {deuda ? (c.saldo < 0 ? `Se le debe ${formatoDinero(-c.saldo)}` : "Al día") : formatoDinero(c.saldo, c.moneda)}
                      </span>
                    </Link>
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
