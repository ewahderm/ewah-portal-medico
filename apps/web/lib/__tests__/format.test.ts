import { afterEach, describe, expect, it, vi } from "vitest";
import { hoy } from "@/lib/format";

describe("hoy", () => {
  afterEach(() => vi.useRealTimers());

  it("devuelve la fecha de Colombia, no la de UTC, pasadas las 7 p. m.", () => {
    // 22:00 del 6-oct en Bogotá = 03:00 UTC del 7-oct.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T03:00:00Z"));
    expect(hoy()).toBe("2026-10-06");
  });

  it("no se adelanta ni se atrasa al mediodía", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T17:00:00Z"));
    expect(hoy()).toBe("2026-10-07");
  });

  it("cambia de día a la medianoche de Bogotá (05:00 UTC)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T04:59:00Z"));
    expect(hoy()).toBe("2026-10-06");
    vi.setSystemTime(new Date("2026-10-07T05:00:00Z"));
    expect(hoy()).toBe("2026-10-07");
  });
});
