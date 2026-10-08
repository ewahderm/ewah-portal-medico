import { NextRequest, NextResponse } from "next/server";
import { enviarAlertasRrhh } from "@/lib/rrhh/alertas";
import { enviarAlertasHabilitacion } from "@/lib/habilitacion/alertas";
import { enviarAlertasSst } from "@/lib/sst/alertas";
import { enviarAlertasFinanzas } from "@/lib/finanzas/alertas";

// Un solo cron diario (7:00 Bogotá) para las alertas de RRHH, Habilitación,
// SG-SST y Flujo de caja: el plan Hobby de Vercel admite pocos cron jobs, y las dos
// funciones ya viven separadas en lib/ (§4.4). En secuencia, y ninguna
// lanza: si una falla, las demás igual corren.
// Mismo patrón que /api/cron/recordatorio-citas: Vercel agrega
// `Authorization: Bearer <CRON_SECRET>` en cada invocación programada.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const rrhh = await enviarAlertasRrhh();
  const habilitacion = await enviarAlertasHabilitacion();
  const sst = await enviarAlertasSst();
  const finanzas = await enviarAlertasFinanzas();
  return NextResponse.json({ rrhh, habilitacion, sst, finanzas });
}
