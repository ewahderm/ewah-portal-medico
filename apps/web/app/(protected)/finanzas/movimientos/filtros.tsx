"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";

type Opcion = { value: string; label: string };

const TIPOS: Opcion[] = [
  { value: "", label: "Todo" },
  { value: "ingreso", label: "Entradas" },
  { value: "egreso", label: "Salidas" },
  { value: "transferencia", label: "Entre cuentas" },
];

// Filtros en la URL (se pueden compartir y sobreviven a recargar).
export function FiltrosMovimientos(props: {
  mes: string;
  tipo: string;
  cuenta: string;
  categoria: string;
  cuentas: Opcion[];
  categorias: Opcion[];
}) {
  const router = useRouter();
  function ir(
    cambio: Partial<Record<"tipo" | "cuenta" | "categoria", string>>,
  ) {
    const p = new URLSearchParams({ mes: props.mes });
    const v = {
      tipo: props.tipo,
      cuenta: props.cuenta,
      categoria: props.categoria,
      ...cambio,
    };
    for (const [k, val] of Object.entries(v)) if (val) p.set(k, val);
    router.push(`/finanzas/movimientos?${p}`);
  }
  const hayFiltros = props.tipo || props.cuenta || props.categoria;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-center">
      {/* El nombre accesible va en un <label> (Combobox no pasa aria-label al input). */}
      <div>
        <Label htmlFor="filtroTipo" className="sr-only">
          Tipo
        </Label>
        <Combobox
          key={`t-${props.tipo}`}
          id="filtroTipo"
          items={TIPOS}
          value={props.tipo}
          onValueChange={(v) => ir({ tipo: String(v ?? "") })}
        />
      </div>
      <div>
        <Label htmlFor="filtroCuenta" className="sr-only">
          Cuenta
        </Label>
        <Combobox
          key={`c-${props.cuenta}`}
          id="filtroCuenta"
          items={[{ value: "", label: "Todas las cuentas" }, ...props.cuentas]}
          value={props.cuenta}
          onValueChange={(v) => ir({ cuenta: String(v ?? "") })}
        />
      </div>
      <div>
        <Label htmlFor="filtroCategoria" className="sr-only">
          Categoría
        </Label>
        <Combobox
          key={`k-${props.categoria}`}
          id="filtroCategoria"
          items={[
            { value: "", label: "Todas las categorías" },
            ...props.categorias,
          ]}
          value={props.categoria}
          onValueChange={(v) => ir({ categoria: String(v ?? "") })}
        />
      </div>
      {hayFiltros ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/finanzas/movimientos?mes=${props.mes}`)}
        >
          Quitar filtros
        </Button>
      ) : null}
    </div>
  );
}
