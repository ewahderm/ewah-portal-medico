import { NextRequest, NextResponse } from "next/server";
import { enviarAlertasRrhh } from "@/lib/rrhh/alertas";
import { enviarAlertasHabilitacion } from "@/lib/habilitacion/alertas";

// Un solo cron diario (7:00 Bogotá) para las alertas de RRHH y de
// Habilitación: el plan Hobby de Vercel admite pocos cron jobs, y las dos
// funciones ya viven separadas en lib/ (§4.4). En secuencia, y cada una
// nunca lanza: si una falla, la otra igual corre.
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
  return NextResponse.json({ rrhh, habilitacion });
}
