"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckCircle2Icon, RefreshCwIcon } from "lucide-react";
import { confirmarPago, excluirCobro, ponerAlDiaIngresos, registrarCobro, reincluirCobro } from "@/lib/finanzas/tratamientos-acciones";
import {
  SITUACIONES,
  VISTAS_COBROS,
  resumirPendientes,
  sePuedeExcluir,
  validarCobro,
  validarMotivoExclusion,
  type IngresoPendiente,
  type SituacionIngreso,
  type VistaCobros,
} from "@/lib/finanzas/tratamientos";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
  vista,
  pendientes,
  otraVista,
  cuentas,
  hoy,
  fechaInicio,
  puedeCrear,
  puedeEditar,
}: {
  vista: VistaCobros;
  pendientes: IngresoPendiente[];
  otraVista: IngresoPendiente[];
  cuentas: Opcion[];
  hoy: string;
  fechaInicio: string;
  puedeCrear: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [cobrando, setCobrando] = useState<IngresoPendiente | null>(null);
  const [excluyendo, setExcluyendo] = useState<IngresoPendiente | null>(null);
  const resumen = resumirPendientes(pendientes);
  const de = (s: SituacionIngreso) => pendientes.filter((p) => p.situacion === s);
  const nada = pendientes.length === 0;

  async function reincluir(p: IngresoPendiente) {
    if (!p.cobro_id) return;
    const r = await reincluirCobro(p.cobro_id);
    if (r.error) return toast.add({ title: "No se pudo volver a incluir", description: r.error, type: "error" });
    toast.add({ title: "Vuelve a los pendientes", description: "Entrará al flujo de caja al poner al día.", type: "success" });
    router.refresh();
  }

  const filtro = <FiltroVista vista={vista} pendientes={pendientes.length} />;
  const dialogoExcluir = excluyendo ? <ExcluirDialog pendiente={excluyendo} onCerrar={() => setExcluyendo(null)} /> : null;

  if (vista !== "pendientes") {
    const info = SITUACIONES[vista === "en_flujo" ? "en_flujo" : "excluido"];
    return (
      <div className="space-y-4">
        {filtro}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {info.titulo} <span className="font-normal text-muted-foreground">({otraVista.length})</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{info.ayuda}</p>
          </CardHeader>
          <CardContent>
            {otraVista.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {vista === "en_flujo" ? "Todavía no hay cobros con ingreso en el flujo de caja." : "No has excluido ningún cobro del flujo de caja."}
              </p>
            ) : (
              <Lista filas={otraVista} puedeCrear={false} onCobrar={setCobrando} onExcluir={setExcluyendo} puedeExcluir={false} onReincluir={puedeCrear ? reincluir : undefined} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filtro}
      {resumen.porGenerar.cantidad || resumen.anuladosConIngreso ? <PonerAlDia resumen={resumen} puedeCrear={puedeCrear} /> : null}

      <Seccion situacion="corregido_sin_anular" filas={de("corregido_sin_anular")} puedeCrear={false} onCobrar={setCobrando} onExcluir={setExcluyendo} puedeExcluir={puedeCrear} />
      <Seccion situacion="anulado_liquidado" filas={de("anulado_liquidado")} puedeCrear={false} onCobrar={setCobrando} onExcluir={setExcluyendo} puedeExcluir={puedeCrear} />
      <Seccion situacion="sin_cobrar" filas={de("sin_cobrar")} total={resumen.sinCobrar.valor} puedeCrear={false} onCobrar={setCobrando} onExcluir={setExcluyendo} puedeExcluir={false} />

      {nada ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <CheckCircle2Icon className="size-5 text-emerald-700" />
            Todas las atenciones desde el {fechaLegible(fechaInicio)} están cobradas y con su ingreso registrado.
          </CardContent>
        </Card>
      ) : null}

      <Seccion
        situacion="por_cobrar"
        filas={de("por_cobrar")}
        total={resumen.porCobrar.valor}
        puedeCrear={puedeCrear}
        onCobrar={setCobrando} onExcluir={setExcluyendo} puedeExcluir={puedeCrear}
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
                    {m.cantidad} {m.cantidad === 1 ? "cobro" : "cobros"} · {formatoDinero(m.valor)}
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
            <Lista filas={de("medio_sin_cuenta")} puedeCrear={puedeCrear} onCobrar={setCobrando} onExcluir={setExcluyendo} puedeExcluir={puedeCrear} />
          </CardContent>
        </Card>
      ) : null}

      <Seccion situacion="por_confirmar" filas={de("por_confirmar")} total={resumen.porConfirmar.valor} puedeCrear={puedeCrear} onCobrar={setCobrando} onExcluir={setExcluyendo} puedeExcluir={puedeCrear} />
      <Seccion situacion="por_generar" filas={de("por_generar")} total={resumen.porGenerar.valor} puedeCrear={puedeCrear} onCobrar={setCobrando} onExcluir={setExcluyendo} puedeExcluir={puedeCrear} />
      <Seccion situacion="sin_valor" filas={de("sin_valor")} puedeCrear={puedeCrear} onCobrar={setCobrando} onExcluir={setExcluyendo} puedeExcluir={puedeCrear} />
      <Seccion situacion="fecha_futura" filas={de("fecha_futura")} puedeCrear={false} onCobrar={setCobrando} onExcluir={setExcluyendo} puedeExcluir={puedeCrear} />

      {cobrando && cobrando.situacion === "por_confirmar" ? (
        <ConfirmarPagoDialog pendiente={cobrando} hoy={hoy} fechaInicio={fechaInicio} onCerrar={() => setCobrando(null)} />
      ) : cobrando ? (
        <CobroDialog pendiente={cobrando} cuentas={cuentas} hoy={hoy} fechaInicio={fechaInicio} onCerrar={() => setCobrando(null)} />
      ) : null}
      {dialogoExcluir}
    </div>
  );
}

function FiltroVista({ vista, pendientes }: { vista: VistaCobros; pendientes: number }) {
  return (
    <nav aria-label="Estado de los cobros" className="flex flex-wrap gap-2">
      {VISTAS_COBROS.map((v) => {
        const activa = v.valor === vista;
        return (
          <Link
            key={v.valor}
            href={v.valor === "pendientes" ? "/finanzas/cobros" : `/finanzas/cobros?ver=${v.valor}`}
            aria-current={activa ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              activa ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            {v.titulo}
            {v.valor === "pendientes" && pendientes > 0 ? <span className="ml-1.5 tabular-nums text-muted-foreground">({pendientes})</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function ConfirmarPagoDialog({ pendiente: p, hoy, fechaInicio, onCerrar }: { pendiente: IngresoPendiente; hoy: string; fechaInicio: string; onCerrar: () => void }) {
  const router = useRouter();
  const minimo = p.fecha > fechaInicio ? p.fecha : fechaInicio;
  const [fecha, setFecha] = useState(hoy < minimo ? minimo : hoy);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return setError("Elige la fecha del pago.");
    if (fecha > hoy) return setError("La fecha del pago no puede ser futura.");
    if (fecha < minimo) return setError("El pago no puede ser anterior al cobro ni al inicio del flujo de caja.");
    setEnviando(true);
    setError(null);
    if (!p.cobro_id) return;
    const r = await confirmarPago({ cobroId: p.cobro_id, fecha });
    setEnviando(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Pago confirmado", description: "Entra a la pasarela, pendiente de abono.", type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar pago</DialogTitle>
          <DialogDescription>
            {p.paciente ?? "Paciente"} · {p.tratamiento ?? "Tratamiento"} del {fechaLegible(p.fecha)} · {p.valor === null ? "Sin valor" : formatoDinero(p.valor)}. La pasarela
            ya lo cobró: entra como ingreso pendiente de abono hasta que llegue al banco.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="fechaPago">Fecha en que la pasarela cobró</Label>
            <Input id="fechaPago" type="date" value={fecha} min={minimo} max={hoy} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : "Confirmar pago"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExcluirDialog({ pendiente: p, onCerrar }: { pendiente: IngresoPendiente; onCerrar: () => void }) {
  const router = useRouter();
  // Un cobro que esperaba la confirmación de la pasarela y no se pagó sale
  // del flujo con el mismo mecanismo (reversible).
  const noPagado = p.situacion === "por_confirmar";
  const [motivo, setMotivo] = useState(noPagado ? "La pasarela no confirmó el pago" : "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const invalido = validarMotivoExclusion(motivo);
    if (invalido) return setError(invalido);
    setEnviando(true);
    setError(null);
    if (!p.cobro_id) return;
    const r = await excluirCobro({ cobroId: p.cobro_id, motivo });
    setEnviando(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Excluido del flujo de caja", description: "Lo ves en la pestaña Excluidos, donde puedes volver a incluirlo.", type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{noPagado ? "No se pagó" : "No meter en el flujo de caja"}</DialogTitle>
          <DialogDescription>
            {p.paciente ?? "Paciente"} · {p.tratamiento ?? "Tratamiento"} del {fechaLegible(p.fecha)}
            {p.valor === null ? "" : ` · ${formatoDinero(p.valor)}`}. {noPagado ? "No entrará al flujo de caja; si el paciente paga después, lo vuelves a incluir desde Excluidos." : "No generará ingreso ni pedirá revisión."} La atención y su cobro no se modifican.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="motivoExclusion">{noPagado ? "Motivo" : "¿Por qué no entra al flujo?"}</Label>
            <Textarea
              id="motivoExclusion"
              rows={3}
              maxLength={500}
              placeholder="Ej.: cortesía de la gerencia, se cobró fuera de la clínica, registro de prueba…"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : noPagado ? "Marcar como no pagado" : "No meter en el flujo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
      ? `${resumen.anuladosConIngreso} ${resumen.anuladosConIngreso === 1 ? "ingreso" : "ingresos"} de cobros anulados por anular`
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
          Listos para poner al día: {partes.join(" y ")}. Entran con la fecha de cada cobro. Si alguno llegó a otra cuenta,
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
  onExcluir,
  puedeExcluir,
}: {
  situacion: SituacionIngreso;
  filas: IngresoPendiente[];
  total?: number;
  puedeCrear: boolean;
  onCobrar: (p: IngresoPendiente) => void;
  onExcluir: (p: IngresoPendiente) => void;
  puedeExcluir: boolean;
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
        <Lista filas={filas} puedeCrear={puedeCrear} onCobrar={onCobrar} onExcluir={onExcluir} puedeExcluir={puedeExcluir} />
      </CardContent>
    </Card>
  );
}

// Marca de cada fila: ya entró al flujo, está pendiente o se excluyó.
function MarcaEstado({ situacion }: { situacion: SituacionIngreso }) {
  if (situacion === "en_flujo") return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Ya en el flujo</Badge>;
  if (situacion === "excluido") return <Badge variant="outline">Excluido</Badge>;
  return <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">Pendiente</Badge>;
}

function Lista({
  filas,
  puedeCrear,
  onCobrar,
  onExcluir,
  puedeExcluir,
  onReincluir,
}: {
  filas: IngresoPendiente[];
  puedeCrear: boolean;
  onCobrar: (p: IngresoPendiente) => void;
  onExcluir: (p: IngresoPendiente) => void;
  puedeExcluir: boolean;
  onReincluir?: (p: IngresoPendiente) => void;
}) {
  return (
    <>
      <ul className="divide-y">
        {filas.slice(0, LIMITE).map((p) => (
          <li key={p.cobro_id ?? p.atencion_id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium break-words">{p.paciente || "Paciente"}</span>
              <span className="block text-xs text-muted-foreground">
                {fechaLegible(p.fecha)} · {p.tratamiento ?? "Tratamiento"} · {p.medio_pago ?? (p.situacion === "sin_cobrar" ? "Sin cobrar" : "Sin medio")}
              </span>
              {p.motivo ? <span className="block text-xs text-muted-foreground break-words">Motivo: {p.motivo}</span> : null}
            </span>
            <MarcaEstado situacion={p.situacion} />
            <span className="text-sm font-semibold tabular-nums">{p.valor === null ? "Sin valor" : formatoDinero(p.valor)}</span>
            {p.situacion === "sin_cobrar" && p.paciente_id ? (
              // Se cobra desde la atención (medio de pago y total), no desde aquí.
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/pacientes/${p.paciente_id}`} />}>
                Ir a la ficha
              </Button>
            ) : null}
            {puedeCrear && p.cobro_id ? (
              <Button size="sm" variant="outline" onClick={() => onCobrar(p)}>
                {p.situacion === "por_confirmar" ? "Confirmar pago" : "Registrar cobro"}
              </Button>
            ) : null}
            {puedeExcluir && sePuedeExcluir(p.situacion) ? (
              <Button size="sm" variant="ghost" onClick={() => onExcluir(p)}>
                {p.situacion === "por_confirmar" ? "No se pagó" : "No meter en el flujo"}
              </Button>
            ) : null}
            {onReincluir && p.situacion === "excluido" ? (
              <Button size="sm" variant="outline" onClick={() => onReincluir(p)}>
                Volver a incluir
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
    if (!p.cobro_id) return;
    const r = await registrarCobro({ cobroId: p.cobro_id, cuentaId, fecha, monto });
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
