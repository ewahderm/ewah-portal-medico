import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GUIAS, GRUPOS, guiasVecinas, normalizar, textoDeGuia } from "@/lib/manual";

describe("manual de usuario", () => {
  it("slugs y ids de sección únicos y válidos", () => {
    const slugs = GUIAS.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const g of GUIAS) {
      expect(g.slug).toMatch(/^[a-z0-9-]+$/);
      expect(GRUPOS).toContain(g.grupo);
      const ids = g.secciones.map((s) => s.id);
      expect(new Set(ids).size, g.slug).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });
  it("cada captura citada existe en public/manual", () => {
    const faltan = GUIAS.flatMap((g) =>
      g.secciones.flatMap((s) => s.bloques.flatMap((b) => (b.tipo === "imagen" && !existsSync(join(process.cwd(), "public/manual", b.archivo)) ? [`${g.slug}: ${b.archivo}`] : []))),
    );
    expect(faltan).toEqual([]);
  });
  it("vecinas y búsqueda sin tildes", () => {
    expect(guiasVecinas(GUIAS[0].slug).anterior).toBeNull();
    expect(guiasVecinas(GUIAS[GUIAS.length - 1].slug).siguiente).toBeNull();
    expect(normalizar("Atención Médica")).toBe("atencion medica");
    expect(textoDeGuia(GUIAS[0]).length).toBeGreaterThan(100);
  });
});
