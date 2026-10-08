"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckCircle2Icon, RefreshCwIcon } from "lucide-react";
import { ponerAlDiaIngresos, registrarCobro } from "@/lib/finanzas/tratamientos-acciones";
import { SITUACIONES, resumirPendientes, validarCobro, type IngresoPendiente, type SituacionIngreso } from "@/lib/finanzas/tratamientos";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoDinero } from "../_components/campo-dinero";

type Opcion = { id: string; nombre: string };

const LIMITE = 100;

export function CobrosCliente({
  pendientes,
  cuentas,
  hoy,
  fechaInicio,
  puedeCrear,
  puedeEditar,
}: {
  pendientes: IngresoPendiente[];
  cuentas: Opcion[];
  hoy: string;
  fechaInicio: string;
  puedeCrear: boolean;
  puedeEditar: boolean;
}) {
  const [cobrando, setCobrando] = useState<IngresoPendiente | null>(null);
  const resumen = resumirPendientes(pendientes);
  const de = (s: SituacionIngreso) => pendientes.filter((p) => p.situacion === s);
  const nada = pendientes.length === 0;

  return (
    <div className="space-y-4">
      {resumen.porGenerar.cantidad || resumen.anuladosConIngreso ? <PonerAlDia resumen={resumen} puedeCrear={puedeCrear} /> : null}

      <Seccion situacion="corregido_sin_anular" filas={de("corregido_sin_anular")} puedeCrear={false} onCobrar={setCobrando} />

      {nada ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <CheckCircle2Icon className="size-5 text-emerald-700" />
            Todos los tratamientos desde el {fechaLegible(fechaInicio)} ya tienen su ingreso registrado.
          </CardContent>
        </Card>
      ) : null}

      <Seccion
        situacion="por_cobrar"
        filas={de("por_cobrar")}
        total={resumen.porCobrar.valor}
        puedeCrear={puedeCrear}
        onCobrar={setCobrando}
      />

      {resumen.mediosSinCuenta.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">{SITUACIONES.medio_sin_cuenta.titulo}</CardTitle>
            <p className="text-sm text-muted-foreground">{SITUACIONES.medio_sin_cuenta.ayuda}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y rounded-lg border">
              {resumen.mediosSinCuenta.map((m) => (
                <li key={m.medioPagoId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{m.nombre}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {m.cantidad} {m.cantidad === 1 ? "tratamiento" : "tratamientos"} · {formatoDinero(m.valor)}
                  </span>
                </li>
              ))}
            </ul>
            {puedeEditar ? (
              <Link href="/finanzas/configuracion?tab=medios" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                Asignar cuentas a los medios de pago <ArrowRightIcon className="size-4" />
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">Pide a un administrador que asigne la cuenta de cada medio de pago.</p>
            )}
            <Lista filas={de("medio_sin_cuenta")} puedeCrear={puedeCrear} onCobrar={setCobrando} />
          </CardContent>
        </Card>
      ) : null}

      <Seccion situacion="por_generar" filas={de("por_generar")} total={resumen.porGenerar.valor} puedeCrear={puedeCrear} onCobrar={setCobrando} />
      <Seccion situacion="sin_valor" filas={de("sin_valor")} puedeCrear={puedeCrear} onCobrar={setCobrando} />
      <Seccion situacion="fecha_futura" filas={de("fecha_futura")} puedeCrear={false} onCobrar={setCobrando} />

      {cobrando ? <CobroDialog pendiente={cobrando} cuentas={cuentas} hoy={hoy} fechaInicio={fechaInicio} onCerrar={() => setCobrando(null)} /> : null}
    </div>
  );
}

function PonerAlDia({ resumen, puedeCrear }: { resumen: ReturnType<typeof resumirPendientes>; puedeCrear: boolean }) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  const partes = [
    resumen.porGenerar.cantidad
      ? `${resumen.porGenerar.cantidad} ${resumen.porGenerar.cantidad === 1 ? "ingreso" : "ingresos"} por ${formatoDinero(resumen.porGenerar.valor)}`
      : null,
    resumen.anuladosConIngreso
      ? `${resumen.anuladosConIngreso} ${resumen.anuladosConIngreso === 1 ? "ingreso" : "ingresos"} de tratamientos anulados por anular`
      : null,
  ].filter(Boolean);

  async function aplicar() {
    setPendiente(true);
    const r = await ponerAlDiaIngresos();
    setPendiente(false);
    if (r.error) return toast.add({ title: "No se pusieron al día", description: r.error, type: "error" });
    const hechos = [
      r.generados ? `${r.generados} ${r.generados === 1 ? "ingreso registrado" : "ingresos registrados"} por ${formatoDinero(r.valor ?? 0)}` : null,
      r.anulados ? `${r.anulados} ${r.anulados === 1 ? "ingreso anulado" : "ingresos anulados"}` : null,
    ].filter(Boolean);
    if (r.fallidos) {
      toast.add({
        title: "Quedaron pendientes",
        description: `${hechos.join(" · ")}${hechos.length ? ". " : ""}${r.fallidos} no se pudieron registrar; siguen en la lista.`,
        type: "error",
      });
    } else {
      toast.add({ title: "Flujo de caja al día", description: hechos.join(" · ") || "No había nada pendiente.", type: "success" });
    }
    router.refresh();
  }

  return (
    <Alert>
      <RefreshCwIcon />
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Listos para poner al día: {partes.join(" y ")}. Entran con la fecha de cada tratamiento. Si alguno llegó a otra cuenta,
          registra su cobro en la lista de abajo antes de poner al día.
        </span>
        {puedeCrear ? (
          <Button size="sm" onClick={aplicar} disabled={pendiente} className="shrink-0">
            {pendiente ? "Poniendo al día…" : "Poner al día"}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function Seccion({
  situacion,
  filas,
  total,
  puedeCrear,
  onCobrar,
}: {
  situacion: SituacionIngreso;
  filas: IngresoPendiente[];
  total?: number;
  puedeCrear: boolean;
  onCobrar: (p: IngresoPendiente) => void;
}) {
  if (!filas.length) return null;
  const info = SITUACIONES[situacion];
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">
            {info.titulo} <span className="font-normal text-muted-foreground">({filas.length})</span>
          </CardTitle>
          <p className="text-sm text-muted-foreground">{info.ayuda}</p>
        </div>
        {total !== undefined ? <p className="shrink-0 text-lg font-semibold tabular-nums">{formatoDinero(total)}</p> : null}
      </CardHeader>
      <CardContent>
        <Lista filas={filas} puedeCrear={puedeCrear} onCobrar={onCobrar} />
      </CardContent>
    </Card>
  );
}

function Lista({ filas, puedeCrear, onCobrar }: { filas: IngresoPendiente[]; puedeCrear: boolean; onCobrar: (p: IngresoPendiente) => void }) {
  return (
    <>
      <ul className="divide-y">
        {filas.slice(0, LIMITE).map((p) => (
          <li key={p.tratamiento_id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium break-words">{p.paciente || "Paciente"}</span>
              <span className="block text-xs text-muted-foreground">
                {fechaLegible(p.fecha)} · {p.tratamiento ?? "Tratamiento"} · {p.medio_pago ?? "Sin medio"}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums">{p.valor === null ? "Sin valor" : formatoDinero(p.valor)}</span>
            {puedeCrear ? (
              <Button size="sm" variant="outline" onClick={() => onCobrar(p)}>
                Registrar cobro
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {filas.length > LIMITE ? <p className="pt-2 text-xs text-muted-foreground">Y {filas.length - LIMITE} más.</p> : null}
    </>
  );
}

function CobroDialog({
  pendiente: p,
  cuentas,
  hoy,
  fechaInicio,
  onCerrar,
}: {
  pendiente: IngresoPendiente;
  cuentas: Opcion[];
  hoy: string;
  fechaInicio: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [cuentaId, setCuentaId] = useState<string | null>(cuentas.length === 1 ? cuentas[0].id : null);
  const [fecha, setFecha] = useState(hoy);
  const [monto, setMonto] = useState<number | null>(p.valor && p.valor > 0 ? p.valor : null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const invalido = validarCobro({ monto, fecha, cuentaId, hoy, fechaInicio });
    if (invalido) return setError(invalido);
    setEnviando(true);
    setError(null);
    const r = await registrarCobro({ tratamientoId: p.tratamiento_id, cuentaId, fecha, monto });
    setEnviando(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Cobro registrado", description: `${formatoDinero(monto ?? 0)}${p.paciente ? ` de ${p.paciente}` : ""}`, type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar cobro</DialogTitle>
          <DialogDescription>
            {p.paciente ?? "Paciente"} · {p.tratamiento ?? "Tratamiento"} del {fechaLegible(p.fecha)}. Entra como ingreso de servicios de salud.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="cuentaCobro">¿A qué cuenta llegó?</Label>
            <Combobox id="cuentaCobro" items={cuentas.map((c) => ({ value: c.id, label: c.nombre }))} value={cuentaId} onValueChange={(v) => setCuentaId(v ? String(v) : null)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fechaCobro">Fecha del cobro</Label>
              <Input id="fechaCobro" type="date" value={fecha} min={fechaInicio} max={hoy} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="montoCobro">Valor cobrado</Label>
              <CampoDinero id="montoCobro" valorInicial={monto} onValor={setMonto} required />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : "Registrar cobro"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
