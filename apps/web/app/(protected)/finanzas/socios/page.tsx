import { TriangleAlertIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoFinanzas, getCategorias, getConfigFinanzas, getCuentas, getMovimientosSocio, getSaldos, getSaldosSocios, getSocios } from "@/lib/finanzas/consultas";
import { hoyBogota } from "@/lib/habilitacion/servidor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SociosCliente } from "./socios-cliente";

// FC5: lo que la clínica le debe a cada socio y lo que él le debe, con
// reembolsos, préstamos y devoluciones.
export default async function SociosPage() {
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
        <TriangleAlertIcon />
        <AlertDescription>Primero activa el flujo de caja desde Inicio.</AlertDescription>
      </Alert>
    );
  }
  if (!acceso.gestion) {
    return (
      <Alert>
        <AlertDescription>Los socios, sus tarjetas y préstamos están disponibles en el plan Pro.</AlertDescription>
      </Alert>
    );
  }
  const [socios, saldosSocios, cuentas, saldos, categorias] = await Promise.all([
    getSocios(supabase),
    getSaldosSocios(supabase),
    getCuentas(supabase),
    getSaldos(supabase),
    getCategorias(supabase),
  ]);
  const visibles = socios.filter((s) => s.activo || (saldosSocios.get(s.id)?.le_debemos ?? 0) || (saldosSocios.get(s.id)?.nos_debe ?? 0));
  const historial = await Promise.all(
    visibles.map((s) => getMovimientosSocio(supabase, s.id, cuentas.filter((c) => c.socio_id === s.id).map((c) => c.id))),
  );
  return (
    <SociosCliente
      socios={visibles.map((s, i) => ({
        id: s.id,
        nombre: s.nombre,
        activo: s.activo,
        porcentaje: s.porcentaje_participacion,
        saldo: saldosSocios.get(s.id) ?? null,
        tarjetas: cuentas
          .filter((c) => c.socio_id === s.id)
          .map((c) => ({ id: c.id, nombre: c.nombre, deuda: Math.max(0, -(saldos.get(c.id) ?? c.saldo_inicial)) })),
        movimientos: historial[i],
      }))}
      cuentas={cuentas.map((c) => ({ id: c.id, nombre: c.nombre, moneda: c.moneda, disponible: c.activa && c.es_disponible && c.moneda === "COP" }))}
      categorias={categorias.map((c) => ({ codigo: c.codigo, nombre: c.nombre }))}
      hoy={hoyBogota()}
      fechaInicio={config.fecha_inicio}
      puedeCrear={acceso.puedeCrear}
      puedeAnular={acceso.puedeAnular}
    />
  );
}
