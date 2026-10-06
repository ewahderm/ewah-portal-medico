import { NextRequest, NextResponse } from "next/server";
import { enviarAlertasRrhh } from "@/lib/rrhh/alertas";

// Mismo patrón que /api/cron/recordatorio-citas: Vercel agrega
// `Authorization: Bearer <CRON_SECRET>` en cada invocación programada.
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const resultado = await enviarAlertasRrhh();
  return NextResponse.json(resultado);
}
