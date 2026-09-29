import { NextRequest, NextResponse } from "next/server";
import { enviarRecordatoriosCitasManana } from "@/lib/citas/recordatorios";

/**
 * Vercel Cron llama a este endpoint (ver vercel.json: "0 23 * * 0-5" — todos
 * los días excepto sábado, a las 6pm Colombia). Vercel agrega
 * automáticamente `Authorization: Bearer <CRON_SECRET>` en cada invocación
 * programada; sin ese header con el valor correcto, cualquier otra llamada
 * se rechaza — este endpoint es público por ser un Route Handler, así que
 * el secreto es la única defensa.
 *
 * Sin chequeo de "no es sábado" aparte: el propio cron.schedule ya excluye
 * el sábado. Se deja así a propósito para que una invocación manual (de
 * prueba, con el secreto correcto) sí funcione cualquier día — no tiene
 * sentido bloquear pruebas por una regla que es de horario, no de datos.
 */
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // ?fecha=yyyy-MM-dd es solo para pruebas manuales (requiere el mismo
  // secreto) — permite verificar el envío real contra una fecha con citas
  // de verdad sin tener que esperar a "mañana".
  const fechaOverride = request.nextUrl.searchParams.get("fecha") ?? undefined;

  const resultado = await enviarRecordatoriosCitasManana(fechaOverride);
  return NextResponse.json(resultado);
}
