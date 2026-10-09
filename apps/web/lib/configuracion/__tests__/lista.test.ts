import { describe, expect, it } from "vitest";
import { armarConfiguracion, estadoModulo, resumirConfiguracion, type Hechos } from "../lista";

const vacia: Hechos = {
  clinica: { nit: null, direccion: null, telefono: null, email: null, ciudadId: null, nombreComercial: null, logo: null, correoNotificaciones: null },
  sedes: 0,
  consultorios: 0,
  usuariosActivos: 1,
  pacientes: 0,
  tiposTratamiento: 0,
  tiposSinCups: 0,
  tiposSinServicio: 0,
  mediosPago: 0,
  serviciosHabilitados: 0,
  insumos: null,
  proveedores: null,
  neveras: null,
  cargos: null,
  empleados: null,
  valoresLegalesAnio: null,
  finanzas: null,
  habilitacionPerfil: null,
  sstPerfil: null,
};

const completa: Hechos = {
  ...vacia,
  clinica: { nit: "900123456", direccion: "Calle 1", telefono: "3000000000", email: "a@b.co", ciudadId: "c", nombreComercial: "EWAH", logo: "l.png", correoNotificaciones: "citas@b.co" },
  sedes: 1,
  consultorios: 2,
  usuariosActivos: 3,
  pacientes: 10,
  tiposTratamiento: 4,
  mediosPago: 3,
  serviciosHabilitados: 2,
};

const BASICOS = new Set(["pacientes", "tratamientos", "citas"]);

describe("asistente de configuración", () => {
  it("una clínica nueva ve lo obligatorio pendiente, sin repetir los consultorios", () => {
    const modulos = armarConfiguracion(vacia, BASICOS);
    expect(modulos.map((m) => m.codigo)).toEqual(["clinica", "pacientes", "tratamientos", "citas"]);
    const r = resumirConfiguracion(modulos);
    // Datos básicos, sedes, consultorios (una vez), tipos de tratamiento y medios de pago.
    expect(r.faltan).toBe(5);
    expect(r.listos).toBe(0);
    expect(modulos.every((m) => estadoModulo(m) === "faltan" || m.codigo === "pacientes")).toBe(true);
  });

  it("una clínica configurada queda completa y solo quedan sugerencias opcionales", () => {
    const modulos = armarConfiguracion({ ...completa, tiposSinCups: 1 }, BASICOS);
    const r = resumirConfiguracion(modulos);
    expect(r.faltan).toBe(0);
    expect(r.listos).toBe(r.obligatorios);
    expect(r.recomendados).toBe(1);
    expect(estadoModulo(modulos.find((m) => m.codigo === "tratamientos")!)).toBe("sugerencias");
    expect(estadoModulo(modulos.find((m) => m.codigo === "clinica")!)).toBe("completo");
  });

  it("un módulo que la clínica no tiene no pide nada", () => {
    const modulos = armarConfiguracion({ ...completa, finanzas: { activado: false, mediosSinDestino: 3, pasarelasSinTarifa: 0 } }, BASICOS);
    expect(modulos.some((m) => m.codigo === "finanzas")).toBe(false);
  });

  it("flujo de caja: activar y asignar cuenta a cada medio de pago son obligatorios", () => {
    const modulos = armarConfiguracion(
      { ...completa, finanzas: { activado: true, mediosSinDestino: 2, pasarelasSinTarifa: 1 } },
      new Set([...BASICOS, "finanzas"]),
    );
    const f = modulos.find((m) => m.codigo === "finanzas")!;
    expect(f.puntos.find((p) => p.id === "finanzas-activar")?.estado).toBe("listo");
    const medios = f.puntos.find((p) => p.id === "finanzas-medios")!;
    expect(medios).toMatchObject({ tipo: "obligatorio", estado: "pendiente", detalle: "2 medios sin cuenta" });
    expect(f.puntos.find((p) => p.id === "finanzas-tarifas")).toMatchObject({ tipo: "recomendado", estado: "pendiente" });
  });

  it("recursos humanos pide cargos, empleados y los valores legales del año", () => {
    const modulos = armarConfiguracion({ ...completa, cargos: 0, empleados: 0, valoresLegalesAnio: false }, new Set([...BASICOS, "rrhh"]));
    const p = modulos.find((m) => m.codigo === "personal")!;
    expect(p.puntos.map((x) => [x.id, x.estado])).toEqual([
      ["cargos", "pendiente"],
      ["empleados", "pendiente"],
      ["valores-legales", "pendiente"],
    ]);
  });

  it("cada punto explica qué es, qué afecta y a dónde ir", () => {
    const todos = armarConfiguracion(
      {
        ...vacia,
        insumos: 0,
        proveedores: 0,
        neveras: 0,
        cargos: 0,
        empleados: 0,
        valoresLegalesAnio: false,
        finanzas: { activado: false, mediosSinDestino: 0, pasarelasSinTarifa: 0 },
        habilitacionPerfil: false,
        sstPerfil: { existe: false, responsable: false },
      },
      new Set(["pacientes", "tratamientos", "citas", "inventario", "finanzas", "rrhh", "medio_ambiente", "habilitacion", "sst"]),
    );
    expect(todos.map((m) => m.codigo)).toEqual([
      "clinica", "pacientes", "tratamientos", "citas", "inventario", "finanzas", "personal", "medio_ambiente", "habilitacion", "sst",
    ]);
    for (const m of todos) {
      expect(m.paraQue.length).toBeGreaterThan(10);
      for (const p of m.puntos) {
        expect(p.queEs.length, p.id).toBeGreaterThan(5);
        expect(p.impacto.length, p.id).toBeGreaterThan(20);
        expect(p.href.startsWith("/"), p.id).toBe(true);
      }
    }
  });
});
