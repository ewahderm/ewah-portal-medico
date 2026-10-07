import "server-only";

// Quién puede ver cada reporte. Reportes no tiene datos propios: cada
// pestaña lee datos de otro módulo, así que además de reportes/VIEW se
// exige el permiso (y el plan, si ese módulo es de pago) del módulo de
// origen. Si no, Reportes se volvería una puerta trasera para ver Inventario
// en plan Gratis o la nómina sin permiso de RRHH.
//   - Actividad clínica: tratamientos/VIEW y pacientes/VIEW.
//   - INVIMA: inventario/VIEW y el entitlement de Inventario.
//   - Comisiones de nómina: rrhh/VIEW O nomina/VIEW (mismo OR que la RLS
//     de comprobantes_nomina en 0048).

import { cache } from "react";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { requireEntitlement } from "@/lib/auth/requireEntitlement";

type Resultado = Awaited<ReturnType<typeof requirePermiso>>;

async function exigirTodos(...chequeos: (() => Promise<Resultado>)[]): Promise<Resultado> {
  let ultimo: Resultado = { ok: false, error: "No tienes permiso para esta acción." };
  for (const chequeo of chequeos) {
    ultimo = await chequeo();
    if (!ultimo.ok) return ultimo;
  }
  return ultimo;
}

export function accesoAnalitica() {
  return exigirTodos(
    () => requirePermiso("reportes", "VIEW"),
    () => requirePermiso("tratamientos", "VIEW"),
    () => requirePermiso("pacientes", "VIEW"),
  );
}

export function accesoInvima() {
  return exigirTodos(
    () => requirePermiso("reportes", "VIEW"),
    () => requirePermiso("inventario", "VIEW"),
    () => requireEntitlement("inventario"),
  );
}

export function accesoNomina() {
  return exigirTodos(
    () => requirePermiso("reportes", "VIEW"),
    async () => {
      const nomina = await requirePermiso("nomina", "VIEW");
      return nomina.ok ? nomina : requirePermiso("rrhh", "VIEW");
    },
  );
}

export type AccesoReportes = {
  puedeVerReportes: boolean;
  puedeVerClinica: boolean;
  puedeVerInvima: boolean;
  puedeVerNomina: boolean;
};

// Para decidir qué pestañas pintar. No reemplaza los chequeos de arriba:
// cada acción y el Route Handler vuelven a validar por su cuenta.
export const getAccesoReportes = cache(async (): Promise<AccesoReportes> => {
  const [reportes, clinica, invima, nomina] = await Promise.all([
    requirePermiso("reportes", "VIEW"),
    accesoAnalitica(),
    accesoInvima(),
    accesoNomina(),
  ]);
  return {
    puedeVerReportes: reportes.ok,
    puedeVerClinica: clinica.ok,
    puedeVerInvima: invima.ok,
    puedeVerNomina: nomina.ok,
  };
});
