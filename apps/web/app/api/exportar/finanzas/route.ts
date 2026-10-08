import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/auth/requirePermiso";
import { construirLibroXlsx, nombreArchivoXlsx } from "@/lib/exportar/xlsx";
import {
  MODULO_FINANZAS,
  TIPOS_CUENTA,
  etiqueta,
} from "@/lib/finanzas/constantes";
import {
  getCategorias,
  getCuentas,
  getMovimientosRango,
  getSedesFinanzas,
  getSocios,
} from "@/lib/finanzas/consultas";
import { calcularInforme } from "@/lib/finanzas/informe-servidor";
import { codigoCategoria } from "@/lib/finanzas/movimientos";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Exportes del flujo de caja (FC6): permiso EXPORT de finanzas y plan Pro.
// tipo=informe: flujo de efectivo por actividades; tipo=movimientos: la
// lista del rango con su categoría, actividad y cuenta.
export async function GET(request: NextRequest) {
  const check = await requirePermiso(MODULO_FINANZAS, "EXPORT");
  if (!check.ok)
    return NextResponse.json({ error: check.error }, { status: 403 });
  const supabase = await createClient();
  const { data: gestion } = await supabase.rpc("has_entitlement", {
    modulo_code: MODULO_FINANZAS,
    feature_code: "gestion",
  });
  if (!gestion)
    return NextResponse.json(
      {
        error:
          "Los exportes del flujo de caja están disponibles en el plan Pro.",
      },
      { status: 403 },
    );

  const p = request.nextUrl.searchParams;
  const tipo = p.get("tipo");
  const desde = p.get("desde") ?? "";
  const hasta = p.get("hasta") ?? "";
  const sede = p.get("sede");
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta)
    return NextResponse.json({ error: "Rango inválido." }, { status: 400 });

  const categorias = await getCategorias(supabase);
  const nombreCategoria = new Map(categorias.map((c) => [c.codigo, c.nombre]));
  const actividad = new Map(categorias.map((c) => [c.codigo, c.actividad]));

  if (tipo === "informe") {
    const calculo = await calcularInforme(supabase, desde, hasta, sede);
    if (!calculo)
      return NextResponse.json(
        { error: "No se pudo calcular el informe." },
        { status: 500 },
      );
    const { informe } = calculo;
    const saldo = (
      concepto: string,
      valor: number | null,
    ): Record<string, string | number>[] =>
      valor === null
        ? []
        : [
            {
              actividad: "Efectivo",
              concepto,
              entrada: "",
              salida: "",
              neto: valor,
            },
          ];
    const renglones: Record<string, string | number>[] = [
      ...saldo("Efectivo al inicio del periodo", calculo.saldoInicial),
      ...informe.bloques.flatMap((b) => [
        ...b.entradas.map((r) => ({
          actividad: b.titulo,
          concepto: r.nombre,
          entrada: r.valor,
          salida: "",
          neto: "",
        })),
        ...b.salidas.map((r) => ({
          actividad: b.titulo,
          concepto: r.nombre,
          entrada: "",
          salida: r.valor,
          neto: "",
        })),
        {
          actividad: b.titulo,
          concepto: "Efectivo neto",
          entrada: "",
          salida: "",
          neto: b.neto,
        },
      ]),
    ];
    renglones.push({
      actividad: "Total",
      concepto: "Aumento (disminución) neto del efectivo",
      entrada: informe.entradas,
      salida: informe.salidas,
      neto: informe.variacion,
    });
    if (calculo.efecto)
      renglones.push(
        ...saldo("Efecto de la tasa de cambio en las divisas", calculo.efecto),
      );
    renglones.push(
      ...saldo("Efectivo al final del periodo", calculo.saldoFinal),
    );
    const libro = construirLibroXlsx([
      {
        nombre: "Flujo de efectivo",
        columnas: [
          { header: "Actividad", key: "actividad" },
          { header: "Concepto", key: "concepto" },
          { header: "Entradas (COP)", key: "entrada" },
          { header: "Salidas (COP)", key: "salida" },
          { header: "Neto (COP)", key: "neto" },
        ],
        filas: renglones,
      },
    ]);
    return new NextResponse(libro, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreArchivoXlsx(`flujo-de-efectivo-${desde}-a-${hasta}`)}"`,
      },
    });
  }

  if (tipo === "movimientos") {
    const [movs, cuentas, sedes, socios] = await Promise.all([
      getMovimientosRango(supabase, desde, hasta, sede),
      getCuentas(supabase),
      getSedesFinanzas(supabase),
      getSocios(supabase),
    ]);
    const cuenta = new Map(cuentas.map((c) => [c.id, c]));
    const nombreSede = new Map(sedes.map((s) => [s.id, s.nombre]));
    const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]));
    const filas = movs.map((m) => {
      const codigo = codigoCategoria(m);
      return {
        fecha: m.fecha,
        tipo: m.tipo,
        categoria: codigo ? (nombreCategoria.get(codigo) ?? codigo) : "",
        actividad: codigo ? (actividad.get(codigo) ?? "") : "",
        cuenta: cuenta.get(m.cuenta_id)?.nombre ?? "",
        tipo_cuenta: etiqueta(TIPOS_CUENTA, cuenta.get(m.cuenta_id)?.tipo),
        cuenta_destino: m.cuenta_destino_id
          ? (cuenta.get(m.cuenta_destino_id)?.nombre ?? "")
          : "",
        moneda: m.moneda,
        monto: m.monto_original,
        tasa: m.tasa_cop,
        valor_cop: m.valor_cop,
        tercero: m.socio_id
          ? (nombreSocio.get(m.socio_id) ?? "")
          : (m.tercero_nombre ?? ""),
        sede: m.sede_id ? (nombreSede.get(m.sede_id) ?? "") : "",
        estado: m.estado,
        origen: m.origen,
        descripcion: m.descripcion ?? "",
        anulado_motivo: m.anulado_motivo ?? "",
      };
    });
    const libro = construirLibroXlsx([
      {
        nombre: "Movimientos",
        columnas: [
          { header: "Fecha", key: "fecha" },
          { header: "Tipo", key: "tipo" },
          { header: "Categoría", key: "categoria" },
          { header: "Actividad", key: "actividad" },
          { header: "Cuenta", key: "cuenta" },
          { header: "Tipo de cuenta", key: "tipo_cuenta" },
          { header: "Cuenta destino", key: "cuenta_destino" },
          { header: "Moneda", key: "moneda" },
          { header: "Monto", key: "monto" },
          { header: "Tasa a COP", key: "tasa" },
          { header: "Valor COP", key: "valor_cop" },
          { header: "Tercero", key: "tercero" },
          { header: "Sede", key: "sede" },
          { header: "Estado", key: "estado" },
          { header: "Origen", key: "origen" },
          { header: "Descripción", key: "descripcion" },
          { header: "Motivo de anulación", key: "anulado_motivo" },
        ],
        filas,
      },
    ]);
    return new NextResponse(libro, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreArchivoXlsx(`movimientos-${desde}-a-${hasta}`)}"`,
      },
    });
  }
  return NextResponse.json({ error: "Exporte inválido." }, { status: 400 });
}
