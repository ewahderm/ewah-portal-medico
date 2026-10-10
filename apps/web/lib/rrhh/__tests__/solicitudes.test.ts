import { describe, expect, it } from "vitest";
import { formatoDias, formatoHoras, horasEntre, tituloModalidad, tituloTipo, validarSolicitud } from "../solicitudes-tipos";

describe("solicitudes de RRHH", () => {
  it("valida vacaciones", () => {
    expect(validarSolicitud({ tipo: "vacaciones", fechaInicio: "2026-12-07", fechaFin: "2026-12-13" })).toBeNull();
    expect(validarSolicitud({ tipo: "vacaciones", fechaInicio: "2026-12-13", fechaFin: "2026-12-07" })).toMatch(/antes de la inicial/);
    expect(validarSolicitud({ tipo: "vacaciones", fechaInicio: "2026-12-07" })).toMatch(/hasta cuándo/);
  });

  it("valida permisos y reposiciones por horas", () => {
    expect(validarSolicitud({ tipo: "permiso", fecha: "2026-11-20", horaInicio: "08:00", horaFin: "11:30", motivo: "Cita médica" })).toBeNull();
    expect(validarSolicitud({ tipo: "permiso", fecha: "2026-11-20", horaInicio: "08:00", horaFin: "11:30", motivo: "" })).toMatch(/motivo/);
    expect(validarSolicitud({ tipo: "permiso", fecha: "2026-11-20", horaInicio: "11:00", horaFin: "09:00", motivo: "Algo" })).toMatch(/después/);
    // La reposición no exige motivo.
    expect(validarSolicitud({ tipo: "reposicion", fecha: "2026-11-28", horaInicio: "08:00", horaFin: "10:00" })).toBeNull();
    expect(validarSolicitud({ tipo: "reposicion", horaInicio: "08:00", horaFin: "10:00" })).toMatch(/día/);
  });

  it("cuenta y muestra horas y días en lenguaje sencillo", () => {
    expect(horasEntre("08:00", "11:30")).toBe(3.5);
    expect(horasEntre("10:00", "09:00")).toBe(0);
    expect(formatoHoras(3.5)).toBe("3 h 30 min");
    expect(formatoHoras(2)).toBe("2 h");
    expect(formatoHoras(0.25)).toBe("15 min");
    expect(formatoDias(1)).toBe("1 día");
    expect(formatoDias(12.5)).toBe("12,5 días");
  });

  it("nombra tipos y modalidades", () => {
    expect(tituloTipo("reposicion")).toBe("Reposición de horas");
    expect(tituloModalidad("remunerado")).toBe("Remunerado, no se repone");
    expect(tituloModalidad(null)).toBeNull();
  });
});
