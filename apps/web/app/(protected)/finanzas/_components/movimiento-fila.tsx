"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeftIcon, ArrowLeftRightIcon, ArrowUpRightIcon, PaperclipIcon } from "lucide-react";
import { anularMovimiento, urlSoporteMovimiento } from "@/lib/finanzas/movimientos-acciones";
import type { Movimiento } from "@/lib/finanzas/consultas";
import type { Moneda } from "@/lib/finanzas/constantes";
import { codigoCategoria } from "@/lib/finanzas/movimientos";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { cn } from "cn";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { abrirFirmado } from "../../habilitacion/_components/abrir-firmado";

export function MovimientoFila({
  movimiento: m,
  nombreCategoria,
  nombreCuenta,
  monedaCuenta,
  nombreSocio,
  compacta = false,
  puedeAnular = false,
  nombreProveedor,
}: {
  movimiento: Movimiento;
  nombreCategoria: Map<string, string>;
  nombreCuenta: Map<string, string>;
  monedaCuenta?: Map<string, Moneda>;
  nombreSocio: Map<string, string>;
  nombreProveedor?: Map<string, string>;
  compacta?: boolean;
  puedeAnular?: boolean;
}) {
  const [anulando, setAnulando] = useState(false);
  const anulado = m.estado === "anulado";
  const esAnulacion = m.origen === "anulacion";
  const deTratamiento = m.origen === "tratamiento";
  const anulable = puedeAnular && !anulado && ["manual", "tratamiento", "reembolso_socio", "devolucion_socio"].includes(m.origen);
  const codigo = codigoCategoria(m);
  const ruta = `${nombreCuenta.get(m.cuenta_id) ?? "Cuenta"} → ${nombreCuenta.get(m.cuenta_destino_id ?? "") ?? "Cuenta"}`;
  // Las transferencias con categoría (reembolso a socio) la muestran primero.
  const titulo =
    m.tipo === "transferencia"
      ? codigo && nombreCategoria.get(codigo)
        ? `${nombreCategoria.get(codigo)}: ${ruta}`
        : ruta
      : (codigo && nombreCategoria.get(codigo)) || "Sin categoría";
  const tercero = m.socio_id ? nombreSocio.get(m.socio_id) : m.proveedor_id ? nombreProveedor?.get(m.proveedor_id) : m.tercero_nombre;
  const Icono = m.tipo === "ingreso" ? ArrowDownLeftIcon : m.tipo === "egreso" ? ArrowUpRightIcon : ArrowLeftRightIcon;
  const signo = m.tipo === "ingreso" ? "+" : m.tipo === "egreso" ? "−" : "";

  return (
    <li className={cn("flex items-start gap-3 py-3", anulado && "opacity-60")}>
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
          m.tipo === "ingreso" ? "bg-emerald-50 text-emerald-700" : m.tipo === "egreso" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
        )}
      >
        <Icono className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          <span className={cn("break-words", anulado && "line-through")}>{titulo}</span>
          {anulado ? <Badge variant="outline">Anulado</Badge> : null}
          {esAnulacion ? <Badge variant="secondary">Anulación</Badge> : null}
          {deTratamiento ? <Badge variant="secondary">Tratamiento</Badge> : null}
          {m.origen === "bold_liquidacion" ? <Badge variant="secondary">Liquidación</Badge> : null}
          {m.estado === "pendiente_abono" ? <Badge variant="outline">Pendiente de abono</Badge> : null}
        </span>
        <span className="block text-xs text-muted-foreground">
          {fechaLegible(m.fecha)}
          {m.tipo !== "transferencia" ? ` · ${nombreCuenta.get(m.cuenta_id) ?? ""}` : ""}
          {tercero ? ` · ${tercero}` : ""}
        </span>
        {!compacta && m.descripcion ? <span className="block text-xs break-words text-muted-foreground">{m.descripcion}</span> : null}
        {!compacta && anulado && m.anulado_motivo ? <span className="block text-xs text-muted-foreground">Anulado: {m.anulado_motivo}</span> : null}
        {!compacta && (m.soporte_nombre_archivo || anulable) ? (
          <span className="mt-1 flex flex-wrap gap-2">
            {m.soporte_nombre_archivo ? (
              <Button size="xs" variant="outline" onClick={() => abrirFirmado(() => urlSoporteMovimiento(m.id))}>
                <PaperclipIcon /> {m.soporte_nombre_archivo}
              </Button>
            ) : null}
            {anulable ? (
              <Button size="xs" variant="ghost" onClick={() => setAnulando(true)}>
                Anular
              </Button>
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-right text-sm tabular-nums">
        <span className={cn("block font-semibold", m.tipo === "ingreso" && "text-emerald-700", m.tipo === "egreso" && "text-destructive")}>
          {signo}
          {formatoDinero(m.monto_original, m.moneda)}
        </span>
        {m.moneda !== "COP" ? <span className="block text-xs text-muted-foreground">{formatoDinero(m.valor_cop)}</span> : null}
        {m.tipo === "transferencia" && m.monto_destino !== null && m.monto_destino !== m.monto_original ? (
          <span className="block text-xs text-muted-foreground">
            llegaron {formatoDinero(m.monto_destino, monedaCuenta?.get(m.cuenta_destino_id ?? "") ?? m.moneda)}
          </span>
        ) : null}
      </span>
      {anulando ? <AnularDialog movimiento={m} titulo={titulo} onCerrar={() => setAnulando(false)} /> : null}
    </li>
  );
}

function AnularDialog({ movimiento, titulo, onCerrar }: { movimiento: Movimiento; titulo: string; onCerrar: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function anular() {
    setPendiente(true);
    setError(null);
    const r = await anularMovimiento(movimiento.id, motivo);
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Movimiento anulado", type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Anular movimiento</DialogTitle>
          <DialogDescription>
            {titulo} por {formatoDinero(movimiento.monto_original, movimiento.moneda)} del {fechaLegible(movimiento.fecha)}. No se borra: queda un
            movimiento inverso que lo compensa, con tu motivo.
            {movimiento.origen === "tratamiento"
              ? " El tratamiento sigue vigente: volverá a Cobros para registrarlo bien (por ejemplo, tras corregir la cuenta de su medio de pago). Si el tratamiento no se hizo, anúlalo en Tratamientos."
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`motivoAnular-${movimiento.id}`}>¿Por qué lo anulas?</Label>
          <Textarea id={`motivoAnular-${movimiento.id}`} rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Al menos 10 caracteres" />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCerrar} disabled={pendiente}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={anular} disabled={pendiente || motivo.trim().length < 10}>
            {pendiente ? "Anulando…" : "Anular"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
