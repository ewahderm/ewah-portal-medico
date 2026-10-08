import { describe, expect, it } from "vitest";
import { aFechaHora, aNumero, decodificarTexto, leerFilas, normalizarEncabezado, parsearDelimitado, resumirPagos } from "../pasarelas/lector";

// Reporte real de transacciones de Bold (dos pagos), con su título y la fila vacía.
const T = "\t";
const ENCABEZADO = [
  "ID TRANSACCION", "FECHA", "ESTADO ACTUAL", "VALOR DE LA COMPRA", "PROPINA", "IVA", "IMPOCONSUMO", "VALOR TOTAL",
  "VALOR RETE FUENTE", "VALOR RETE IVA", "VALOR RETE ICA", "% COMISIÓN BOLD", "COMISIÓN BOLD FIJA", "TOTAL DEDUCCIÓN",
  "DEPOSITO EN CUENTA BOLD", "DESCRIPCIÓN", "SERIAL DEL DATÁFONO", "NOMBRE DEL DATÁFONO", "CODIGO AUTORIZACION", "TIPO TARJETA",
  "FRANQUICIA", "TARJETA", "PAÍS TARJETA", "BANCO", "CUS", "REALIZADA POR", "METODO DE PAGO", "CANAL DE VENTAS", "REFERENCIA",
  "TASA DE CAMBIO", "MONEDA EXTRANJERA", "MONTO EN MONEDA EXTRANJERA", "NOMBRE DEL PAGADOR", "CORREO DEL PAGADOR",
].join(T);
const FILA1 = [
  "CPHVW7ET11WO", "2026-02-09 15:00:23", "COBRO EXITOSO", '"$2,840,000.00"', "$0.00", "$0.00", "$0.00", '"$2,840,000.00"',
  '"$42,600.00"', "$0.00", '"$11,757.60"', '"$99,116.00"', "$300.00", '"$153,773.60"', '"$2,686,226.40"', "", "qpos_plus_30712803241011004809",
  "IZKA", "06401B", "CRÉDITO", "VISA", "440066******9801", "US", "", "", "Claudia Lorena Pinzon chaparro", "Tarjeta de Crédito", "PRESENCIAL",
  "", "", "", "", "", "",
].join(T);
const FILA2 = [
  "CPDS2F7DD2CC", "2026-02-09 15:59:28", "COBRO EXITOSO", '"$6,800,000.00"', "$0.00", "$0.00", "$0.00", '"$6,800,000.00"',
  '"$102,000.00"', "$0.00", '"$28,152.00"', '"$257,720.00"', "$300.00", '"$388,172.00"', '"$6,411,828.00"', "", "qpos_plus_30712803241011004809",
  "IZKA", "869902", "CRÉDITO", "AmEx", "341234*****1005", "INT", "", "", "Claudia Lorena Pinzon chaparro", "Tarjeta de Crédito", "PRESENCIAL",
  "", "", "", "", "", "",
].join(T);
const REPORTE = ["\t\t\t", "Ewah IPS" + T.repeat(33), ENCABEZADO, FILA1, FILA2].join("\r\n");

describe("valores del reporte", () => {
  it("lee montos en formato de Bold y en es-CO", () => {
    expect(aNumero("$2,840,000.00")).toBe(2840000);
    expect(aNumero("$0.00")).toBe(0);
    expect(aNumero("$11,757.60")).toBe(11757.6);
    expect(aNumero("2.840.000,50")).toBe(2840000.5);
    expect(aNumero("1.500")).toBe(1500);
    expect(aNumero("1,5")).toBe(1.5);
    expect(aNumero(1234.5)).toBe(1234.5);
    expect(aNumero("")).toBeNull();
    expect(aNumero("abc")).toBeNull();
  });

  it("lee fechas ISO, dd/mm/aaaa, serie de Excel y Date", () => {
    expect(aFechaHora("2026-02-09 15:00:23")).toBe("2026-02-09 15:00:23");
    expect(aFechaHora("2026-02-09T15:00")).toBe("2026-02-09 15:00:00");
    expect(aFechaHora("09/02/2026 15:00:23")).toBe("2026-02-09 15:00:23");
    expect(aFechaHora(46062.625)).toBe("2026-02-09 15:00:00");
    expect(aFechaHora(new Date(2026, 1, 9, 15, 0, 23))).toBe("2026-02-09 15:00:23");
    expect(aFechaHora("2026-13-40 10:00")).toBeNull();
    expect(aFechaHora("ayer")).toBeNull();
  });

  it("normaliza encabezados con tildes o con la codificación rota", () => {
    expect(normalizarEncabezado("% COMISIÓN BOLD")).toBe("COMISIONBOLD");
    expect(normalizarEncabezado("% COMISI�N BOLD")).toBe("COMISINBOLD");
    expect(normalizarEncabezado("PAÍS TARJETA")).toBe("PAISTARJETA");
  });

  it("decodifica UTF-8 y Windows-1252", () => {
    const utf8 = new TextEncoder().encode("COMISIÓN").buffer as ArrayBuffer;
    expect(decodificarTexto(utf8)).toBe("COMISIÓN");
    const cp1252 = Uint8Array.from([0x43, 0x4f, 0x4d, 0x49, 0x53, 0x49, 0xd3, 0x4e]).buffer as ArrayBuffer;
    expect(decodificarTexto(cp1252)).toBe("COMISIÓN");
  });
});

describe("reporte de transacciones de Bold", () => {
  it("separa el texto con comillas y tabuladores", () => {
    const filas = parsearDelimitado(REPORTE);
    expect(filas[2][0]).toBe("ID TRANSACCION");
    expect(filas[3][3]).toBe("$2,840,000.00");
    expect(filas[3]).toHaveLength(34);
  });

  it("lee los dos pagos con la comisión y las retenciones reales", () => {
    const r = leerFilas(parsearDelimitado(REPORTE));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.perfil).toBe("bold");
    expect(r.errores).toEqual([]);
    expect(r.pagos).toHaveLength(2);
    expect(r.pagos[0]).toMatchObject({
      id_externo: "CPHVW7ET11WO",
      pagado_en: "2026-02-09 15:00:23",
      exitoso: true,
      compra: 2840000,
      valor_total: 2840000,
      // 99.116 de la comisión porcentual + 300 fijos.
      comision: 99416,
      retefuente: 42600,
      reteica: 11757.6,
      reteiva: 0,
      total_deduccion: 153773.6,
      deposito: 2686226.4,
      tipo_tarjeta: "CRÉDITO",
      franquicia: "VISA",
      pais_tarjeta: "US",
      canal: "PRESENCIAL",
      autorizacion: "06401B",
    });
    // Otra franquicia (AmEx internacional) cobra otra comisión.
    expect(r.pagos[1]).toMatchObject({ comision: 258020, deposito: 6411828, franquicia: "AmEx", pais_tarjeta: "INT" });
  });

  it("no guarda la tarjeta ni los datos del pagador", () => {
    const r = leerFilas(parsearDelimitado(REPORTE));
    if (!r.ok) throw new Error("no leyó");
    const claves = Object.keys(r.pagos[0]).join(",");
    expect(claves).not.toMatch(/tarjeta$|pagador|correo|nombre/);
    expect(JSON.stringify(r.pagos)).not.toContain("440066");
    expect(JSON.stringify(r.pagos)).not.toContain("Pinzon");
  });

  it("resume lo que va a importar", () => {
    const r = leerFilas(parsearDelimitado(REPORTE));
    if (!r.ok) throw new Error("no leyó");
    expect(resumirPagos(r.pagos)).toEqual({
      total: 2, exitosos: 2, fallidos: 0, bruto: 9640000, comision: 357436, retenciones: 184509.6, deposito: 9098054.4,
    });
  });

  it("reconoce un pago fallido y no le pide cuadre", () => {
    const fallido = FILA1.replace("COBRO EXITOSO", "COBRO RECHAZADO").replace("CPHVW7ET11WO", "CPFALLIDO001");
    const r = leerFilas(parsearDelimitado([ENCABEZADO, fallido].join("\n")));
    if (!r.ok) throw new Error("no leyó");
    expect(r.pagos[0]).toMatchObject({ exitoso: false, deposito: 0, comision: 0, total_deduccion: 0 });
  });

  it("señala la fila cuyas cuentas no cuadran, sin perder las demás", () => {
    const mala = FILA2.replace('"$6,411,828.00"', '"$6,000,000.00"');
    const r = leerFilas(parsearDelimitado([ENCABEZADO, FILA1, mala].join("\n")));
    if (!r.ok) throw new Error("no leyó");
    expect(r.pagos).toHaveLength(1);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].mensaje).toMatch(/CPDS2F7DD2CC.*depositado/);
  });

  it("detecta un ID repetido, una fecha ilegible y filas sin ID", () => {
    const sinFecha = FILA2.replace("2026-02-09 15:59:28", "ayer");
    const r = leerFilas(parsearDelimitado([ENCABEZADO, FILA1, FILA1, sinFecha, T.repeat(10) + "x"].join("\n")));
    if (!r.ok) throw new Error("no leyó");
    expect(r.pagos).toHaveLength(1);
    expect(r.errores.map((e) => e.mensaje).join("|")).toMatch(/repetida.*fecha no se entiende.*Sin ID/);
  });

  it("funciona igual con las filas de un libro de Excel (valores numéricos)", () => {
    const filas: unknown[][] = [
      ["Ewah IPS"],
      [],
      parsearDelimitado(ENCABEZADO)[0],
      ["XL1", 46062.625, "COBRO EXITOSO", 1000000, 0, 0, 0, 1000000, 15000, 0, 4140, 34900, 300, 54340, 945660],
    ];
    const r = leerFilas(filas);
    if (!r.ok) throw new Error("no leyó");
    expect(r.pagos[0]).toMatchObject({ pagado_en: "2026-02-09 15:00:00", comision: 35200, deposito: 945660 });
  });

  it("rechaza un archivo de otro formato o sin columnas clave", () => {
    const otro = leerFilas([["Fecha", "Valor"], ["2026-01-01", "100"]]);
    expect(otro.ok).toBe(false);
    const sinDeposito = leerFilas([["ID TRANSACCION", "DEPOSITO EN CUENTA BOLD"], ["A", "1"]]);
    expect(sinDeposito.ok).toBe(false);
    if (!sinDeposito.ok) expect(sinDeposito.error).toMatch(/faltan columnas/);
  });
});
