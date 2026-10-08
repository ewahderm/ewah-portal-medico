import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoFinanzas, getConfigFinanzas, getDatosRegistro, getMovimientos, getProveedores } from "@/lib/finanzas/consultas";
import { codigoCategoria, resumirPeriodo } from "@/lib/finanzas/movimientos";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { hoyBogota } from "@/lib/habilitacion/servidor";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MovimientoFila } from "../_components/movimiento-fila";
import { RegistrarMovimientoBotones } from "../_components/registrar-movimiento";
import { FiltrosMovimientos } from "./filtros";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function ultimoDia(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}
function moverMes(mes: string, delta: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// HU-11: movimientos del mes con filtros, totales y anulación.
export default async function MovimientosPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
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
  if (!config) {
    return (
      <Alert>
        <AlertDescription>Primero activa el flujo de caja desde Inicio.</AlertDescription>
      </Alert>
    );
  }
  const q = await searchParams;
  const hoy = hoyBogota();
  const mesActual = hoy.slice(0, 7);
  const mes = typeof q.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes) && q.mes <= mesActual ? q.mes : mesActual;
  const tipo = typeof q.tipo === "string" ? q.tipo : "";
  const cuenta = typeof q.cuenta === "string" ? q.cuenta : "";
  const categoria = typeof q.categoria === "string" ? q.categoria : "";

  const [datos, movimientos, proveedores] = await Promise.all([
    getDatosRegistro(supabase, acceso, config, hoy),
    getMovimientos(supabase, { desde: `${mes}-01`, hasta: ultimoDia(mes), tipo, cuentaId: cuenta, categoria }, 1000),
    getProveedores(supabase),
  ]);
  const resumen = resumirPeriodo(movimientos.map((m) => ({ tipo: m.tipo, categoria: codigoCategoria(m), valor_cop: m.valor_cop, origen: m.origen })));
  const nombreCategoria = new Map(datos.categorias.map((c) => [c.codigo, c.nombre]));
  const nombreCuenta = new Map(datos.cuentas.map((c) => [c.id, c.nombre]));
  const nombreSocio = new Map(datos.socios.map((s) => [s.id, s.nombre]));
  const nombreProveedor = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const [anio, numMes] = mes.split("-").map(Number);
  const anterior = moverMes(mes, -1);
  const siguiente = moverMes(mes, 1);
  const enlace = (m: string) => {
    const p = new URLSearchParams({ mes: m });
    if (tipo) p.set("tipo", tipo);
    if (cuenta) p.set("cuenta", cuenta);
    if (categoria) p.set("categoria", categoria);
    return `/finanzas/movimientos?${p}`;
  };

  return (
    <div className="space-y-4">
      <RegistrarMovimientoBotones {...datos} puedeCrear={acceso.puedeCrear} />
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold">
              Movimientos de {MESES[numMes - 1].toLowerCase()} {anio}
            </CardTitle>
            <div className="flex gap-1">
              {anterior >= config.fecha_inicio.slice(0, 7) ? (
                <Link href={enlace(anterior)} aria-label="Mes anterior" className="rounded-md border p-1.5 hover:bg-muted">
                  <ChevronLeftIcon className="size-4" />
                </Link>
              ) : null}
              {siguiente <= mesActual ? (
                <Link href={enlace(siguiente)} aria-label="Mes siguiente" className="rounded-md border p-1.5 hover:bg-muted">
                  <ChevronRightIcon className="size-4" />
                </Link>
              ) : null}
            </div>
          </div>
          <FiltrosMovimientos
            mes={mes}
            tipo={tipo}
            cuenta={cuenta}
            categoria={categoria}
            cuentas={datos.cuentas.map((c) => ({ value: c.id, label: c.nombre }))}
            categorias={datos.categorias.map((c) => ({ value: c.codigo, label: c.nombre }))}
          />
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg border p-2">
              <p className="text-xs text-muted-foreground">Entró</p>
              <p className="font-semibold tabular-nums text-emerald-700">{formatoDinero(resumen.entradas)}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-xs text-muted-foreground">Salió</p>
              <p className="font-semibold tabular-nums text-destructive">{formatoDinero(resumen.salidas)}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-xs text-muted-foreground">Diferencia</p>
              <p className={cn("font-semibold tabular-nums", resumen.entradas - resumen.salidas < 0 && "text-destructive")}>
                {formatoDinero(resumen.entradas - resumen.salidas)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {movimientos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay movimientos con estos filtros.</p>
          ) : (
            <ul className="divide-y">
              {movimientos.map((m) => (
                <MovimientoFila
                  key={m.id}
                  movimiento={m}
                  nombreCategoria={nombreCategoria}
                  nombreCuenta={nombreCuenta}
                  nombreSocio={nombreSocio}
                  nombreProveedor={nombreProveedor}
                  puedeAnular={acceso.puedeAnular}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
