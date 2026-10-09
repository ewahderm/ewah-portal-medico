"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckCircle2Icon, FileSpreadsheetIcon, HistoryIcon, TriangleAlertIcon } from "lucide-react";
import { anularPagoPasarela, importarPagosPasarela, resolverCambioPago, vincularPagoPasarela } from "@/lib/finanzas/pasarelas-acciones";
import { leerArchivoReporte } from "@/lib/finanzas/pasarelas/leer-archivo";
import { resumirPagos, type Lectura } from "@/lib/finanzas/pasarelas/lector";
import type { CambioPago, CandidatoPago, DatosPago, ImportacionPasarela, PagoSinEmparejar } from "@/lib/finanzas/consultas";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Pasarela = { id: string; nombre: string };

const ACCEPT_REPORTE = ".xlsx,.xls,.csv,.txt,.tsv";

export function ReportePasarela({
  pasarelas,
  sinEmparejar,
  totalSinEmparejar,
  cambios,
  importaciones,
  puedeCrear,
}: {
  pasarelas: Pasarela[];
  sinEmparejar: PagoSinEmparejar[];
  totalSinEmparejar: number;
  cambios: CambioPago[];
  importaciones: ImportacionPasarela[];
  puedeCrear: boolean;
}) {
  const router = useRouter();
  const [cuentaId, setCuentaId] = useState<string | null>(pasarelas.length === 1 ? pasarelas[0].id : null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claveArchivo, setClaveArchivo] = useState(0);
  const nombre = new Map(pasarelas.map((p) => [p.id, p.nombre]));

  async function elegirArchivo(archivo: File | undefined) {
    setLectura(null);
    setError(null);
    if (!archivo) return;
    setNombreArchivo(archivo.name);
    setLeyendo(true);
    setLectura(await leerArchivoReporte(archivo));
    setLeyendo(false);
  }

  async function importar() {
    if (!lectura?.ok) return;
    if (!cuentaId) return setError("Elige a qué pasarela pertenece el reporte.");
    setImportando(true);
    setError(null);
    const r = await importarPagosPasarela({ cuentaId, perfil: lectura.perfil, pagos: lectura.pagos, nombreArchivo, conError: lectura.errores.length });
    setImportando(false);
    if (r.error) return setError(r.error);
    toast.add({
      title: "Reporte importado",
      description: `${r.nuevos} pagos nuevos${r.repetidos ? `, ${r.repetidos} ya estaban (no se duplican)` : ""}${r.cambiados ? `, ${r.cambiados} cambiaron en la pasarela y esperan tu revisión` : ""}. ${r.emparejados} emparejados con su cobro${r.sinEmparejar ? `; ${r.sinEmparejar} esperan que elijas su cobro` : ""}.`,
      type: "success",
    });
    setLectura(null);
    setClaveArchivo((k) => k + 1);
    router.refresh();
  }

  const resumen = lectura?.ok ? resumirPagos(lectura.pagos) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <FileSpreadsheetIcon className="size-4" /> Reporte de la pasarela
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Sube el reporte de transacciones que descargas de la pasarela. Confirma que cada cobro se realizó y trae la comisión y las retenciones reales de
          cada pago, así el neto esperado de la liquidación es exacto. El archivo se lee en tu navegador; no se guardan la tarjeta ni los datos del pagador.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {puedeCrear ? (
          <div className="space-y-3">
            {pasarelas.length > 1 ? (
              <div className="space-y-1 sm:max-w-xs">
                <Label htmlFor="pasarelaReporte">¿De qué pasarela es el reporte?</Label>
                <Combobox id="pasarelaReporte" items={pasarelas.map((p) => ({ value: p.id, label: p.nombre }))} value={cuentaId} onValueChange={(v) => setCuentaId(v ? String(v) : null)} />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="archivoReporte">Archivo del reporte (Excel o texto)</Label>
              <FileInput key={claveArchivo} id="archivoReporte" accept={ACCEPT_REPORTE} onChange={(e) => elegirArchivo(e.target.files?.[0])} />
            </div>
            {leyendo ? <p className="text-sm text-muted-foreground">Leyendo el archivo…</p> : null}
            {lectura && !lectura.ok ? (
              <Alert variant="destructive">
                <AlertDescription>{lectura.error}</AlertDescription>
              </Alert>
            ) : null}
            {lectura?.ok && resumen ? (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {resumen.total} {resumen.total === 1 ? "pago" : "pagos"} leídos: {resumen.exitosos} exitosos
                  {resumen.fallidos ? `, ${resumen.fallidos} no exitosos (no se emparejan)` : ""}.
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums sm:max-w-sm">
                  <dt className="text-muted-foreground">Cobrado</dt>
                  <dd className="text-right">{formatoDinero(resumen.bruto)}</dd>
                  <dt className="text-muted-foreground">Comisión</dt>
                  <dd className="text-right">−{formatoDinero(resumen.comision)}</dd>
                  <dt className="text-muted-foreground">Retenciones</dt>
                  <dd className="text-right">−{formatoDinero(resumen.retenciones)}</dd>
                  <dt className="font-medium">Se deposita</dt>
                  <dd className="text-right font-semibold">{formatoDinero(resumen.deposito)}</dd>
                </dl>
                {lectura.errores.length ? (
                  <Alert>
                    <AlertDescription>
                      <span className="block font-medium">{lectura.errores.length} filas no se importarán:</span>
                      <ul className="list-disc pl-5">
                        {lectura.errores.slice(0, 5).map((e) => (
                          <li key={e.fila}>
                            Fila {e.fila}: {e.mensaje}
                          </li>
                        ))}
                      </ul>
                      {lectura.errores.length > 5 ? <span className="block">Y {lectura.errores.length - 5} más.</span> : null}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {lectura.pagos.length ? (
                  <Button size="sm" onClick={importar} disabled={importando}>
                    {importando ? "Importando…" : "Importar y emparejar"}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Pide a quien registra ingresos que suba el reporte.</p>
        )}

        {cambios.length ? <CambiosPasarela cambios={cambios} puedeCrear={puedeCrear} /> : null}

        {sinEmparejar.length ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              Pagos sin su cobro <span className="font-normal text-muted-foreground">({totalSinEmparejar})</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              La pasarela cobró estos pagos y todavía no están ligados a un cobro del sistema. Elige el cobro que corresponde. Si no aparece ninguno, puede faltar
              registrar el tratamiento (o su fecha es muy distinta).
            </p>
            <ul className="divide-y rounded-lg border">
              {sinEmparejar.map((p) => (
                <FilaSinEmparejar key={p.id} pago={p} nombrePasarela={pasarelas.length > 1 ? nombre.get(p.cuenta_id) ?? null : null} puedeCrear={puedeCrear} />
              ))}
            </ul>
            {totalSinEmparejar > sinEmparejar.length ? <p className="text-xs text-muted-foreground">Se muestran los {sinEmparejar.length} más recientes.</p> : null}
          </section>
        ) : null}

        {importaciones.length ? <HistorialImportaciones importaciones={importaciones} nombrePasarela={pasarelas.length > 1 ? nombre : null} /> : null}
      </CardContent>
    </Card>
  );
}

function etiquetaCandidato(c: CandidatoPago): string {
  const que = c.tipo === "tratamiento" ? "Esperando confirmación" : "Cobro";
  return `${que} · ${fechaLegible(c.fecha)} · ${c.paciente ?? c.descripcion ?? "Tratamiento"}`;
}

function FilaSinEmparejar({ pago: p, nombrePasarela, puedeCrear }: { pago: PagoSinEmparejar; nombrePasarela: string | null; puedeCrear: boolean }) {
  const router = useRouter();
  const [elegido, setElegido] = useState<string | null>(p.candidatos.length === 1 ? claveCandidato(p.candidatos[0]) : null);
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function anular() {
    setPendiente(true);
    setError(null);
    const r = await anularPagoPasarela(p.id, motivo);
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Pago anulado", description: `${p.id_externo} ya no se empareja ni cuenta.`, type: "success" });
    router.refresh();
  }

  async function emparejar() {
    const c = p.candidatos.find((x) => claveCandidato(x) === elegido);
    if (!c) return setError("Elige el cobro.");
    setPendiente(true);
    setError(null);
    const r = await vincularPagoPasarela({ pagoId: p.id, movimientoId: c.movimiento_id, tratamientoId: c.tratamiento_id });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Pago emparejado", description: `${formatoDinero(p.compra)} con su cobro.`, type: "success" });
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center">
      <span className="min-w-0 flex-1">
        <span className="block font-medium tabular-nums">{formatoDinero(p.compra)}</span>
        <span className="block text-xs text-muted-foreground">
          {fechaLegible(p.pagado_en.slice(0, 10))} {p.pagado_en.slice(11, 16)} · {p.franquicia ?? p.tipo_tarjeta ?? "Pago"} · llegan {formatoDinero(p.deposito)} · {p.id_externo}
          {nombrePasarela ? ` · ${nombrePasarela}` : ""}
        </span>
        {error ? <span className="block text-xs text-destructive">{error}</span> : null}
        {anulando ? (
          <span className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Label htmlFor={`motivo-${p.id}`} className="sr-only">
              Motivo de la anulación
            </Label>
            <Input
              id={`motivo-${p.id}`}
              value={motivo}
              maxLength={500}
              placeholder="¿Por qué se anula? Ej.: era de otra pasarela"
              onChange={(e) => setMotivo(e.target.value)}
              className="h-8 text-xs"
            />
            <span className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={anular} disabled={pendiente || motivo.trim().length < 10}>
                Anular pago
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAnulando(false)} disabled={pendiente}>
                Cancelar
              </Button>
            </span>
          </span>
        ) : null}
      </span>
      {puedeCrear && !anulando ? (
        <Button size="sm" variant="ghost" className="self-start text-muted-foreground" onClick={() => setAnulando(true)}>
          Anular
        </Button>
      ) : null}
      {p.candidatos.length === 0 ? (
        <span className="text-xs text-amber-700">Sin cobro del mismo valor y fecha cercana</span>
      ) : puedeCrear ? (
        <div className="flex flex-col gap-2 sm:w-96 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <Label htmlFor={`cand-${p.id}`} className="sr-only">
              Cobro del pago {p.id_externo}
            </Label>
            <Combobox
              id={`cand-${p.id}`}
              items={p.candidatos.map((c) => ({ value: claveCandidato(c), label: etiquetaCandidato(c) }))}
              value={elegido}
              onValueChange={(v) => setElegido(v ? String(v) : null)}
              placeholder="Elige el cobro"
            />
          </div>
          <Button size="sm" variant="outline" onClick={emparejar} disabled={pendiente || !elegido}>
            {pendiente ? "…" : "Emparejar"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

const claveCandidato = (c: CandidatoPago) => `${c.tipo}:${c.movimiento_id ?? c.tratamiento_id}`;

export function MarcaValoresReales({ real }: { real: boolean }) {
  return real ? (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
      <CheckCircle2Icon className="size-3.5" /> valores reales
    </span>
  ) : null;
}

const DINERO_CAMBIO: (keyof DatosPago)[] = ["compra", "comision", "retefuente", "reteica", "reteiva", "deposito"];
const NOMBRE_DATO: Partial<Record<keyof DatosPago, string>> = {
  compra: "Cobrado",
  comision: "Comisión",
  retefuente: "Retención en la fuente",
  reteica: "ReteICA",
  reteiva: "ReteIVA",
  deposito: "Se deposita",
};

function CambiosPasarela({ cambios, puedeCrear }: { cambios: CambioPago[]; puedeCrear: boolean }) {
  return (
    <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:bg-amber-950/20">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <TriangleAlertIcon className="size-4 text-amber-600" /> Cambiaron en la pasarela <span className="font-normal text-muted-foreground">({cambios.length})</span>
      </h3>
      <p className="text-xs text-muted-foreground">
        Estos pagos ya estaban importados, pero un reporte posterior (por ejemplo, el extracto del mes) los trae con otros datos: la pasarela los reversó o
        cambió la comisión. Revísalos: si aceptas, el pago se actualiza; si descartas, se queda como estaba.
      </p>
      <ul className="divide-y rounded-lg border bg-card">
        {cambios.map((c) => (
          <FilaCambio key={c.id} cambio={c} puedeCrear={puedeCrear} />
        ))}
      </ul>
    </section>
  );
}

function FilaCambio({ cambio: c, puedeCrear }: { cambio: CambioPago; puedeCrear: boolean }) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const diferencias = DINERO_CAMBIO.filter((k) => Number(c.antes[k]) !== Number(c.despues[k]));
  const cambioEstado = c.antes.estado_externo !== c.despues.estado_externo;

  async function resolver(aceptar: boolean) {
    setPendiente(true);
    setError(null);
    const r = await resolverCambioPago(c.id, aceptar);
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: aceptar ? "Pago actualizado" : "Cambio descartado", description: c.id_externo, type: "success" });
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-start">
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-medium">
          {c.id_externo} <span className="font-normal text-muted-foreground">· {fechaLegible(c.pagado_en.slice(0, 10))}</span>
        </span>
        {cambioEstado ? (
          <span className="flex flex-wrap items-center gap-1 text-xs">
            Estado: <span className="line-through">{c.antes.estado_externo}</span> <ArrowRightIcon className="size-3" />
            <span className={c.despues.exitoso ? "font-medium" : "font-medium text-destructive"}>{c.despues.estado_externo}</span>
          </span>
        ) : null}
        {diferencias.map((k) => (
          <span key={k} className="flex flex-wrap items-center gap-1 text-xs tabular-nums">
            {NOMBRE_DATO[k]}: <span className="line-through">{formatoDinero(Number(c.antes[k]))}</span> <ArrowRightIcon className="size-3" />
            <span className="font-medium">{formatoDinero(Number(c.despues[k]))}</span>
          </span>
        ))}
        {!c.despues.exitoso ? (
          <span className="block text-xs text-muted-foreground">
            Si aceptas, el pago se suelta de su cobro. Ese cobro queda pendiente de abono: si el paciente no pagó, anúlalo en Movimientos o márcalo en Cobros.
          </span>
        ) : null}
        {c.liquidado ? (
          <span className="block text-xs text-amber-700">Su cobro ya se liquidó: para aceptar, anula primero esa liquidación (más abajo, en Liquidaciones).</span>
        ) : null}
        {error ? <span className="block text-xs text-destructive">{error}</span> : null}
      </span>
      {puedeCrear ? (
        <span className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => resolver(true)} disabled={pendiente || c.liquidado}>
            Aceptar cambio
          </Button>
          <Button size="sm" variant="outline" onClick={() => resolver(false)} disabled={pendiente}>
            Descartar
          </Button>
        </span>
      ) : null}
    </li>
  );
}

function HistorialImportaciones({ importaciones, nombrePasarela }: { importaciones: ImportacionPasarela[]; nombrePasarela: Map<string, string> | null }) {
  const fechaHora = (iso: string) =>
    new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold">
        <HistoryIcon className="size-4" /> Reportes subidos <span className="font-normal text-muted-foreground">({importaciones.length} más recientes)</span>
      </summary>
      <ul className="divide-y border-t">
        {importaciones.map((i) => (
          <li key={i.id} className="flex flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0">
              <span className="block font-medium break-words">{i.nombre_archivo ?? "Reporte sin nombre"}</span>
              <span className="block text-muted-foreground">
                {fechaHora(i.created_at)} · {i.usuario?.nombre ?? "—"}
                {nombrePasarela ? ` · ${nombrePasarela.get(i.cuenta_id) ?? ""}` : ""}
              </span>
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground tabular-nums">
              <span>{i.nuevos} nuevos</span>
              <span>{i.repetidos} ya estaban</span>
              {i.cambiados ? <span className="text-amber-700">{i.cambiados} con cambios</span> : null}
              {i.con_error ? <span className="text-destructive">{i.con_error} con error</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
