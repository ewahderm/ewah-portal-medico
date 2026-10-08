"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, FileSpreadsheetIcon } from "lucide-react";
import { importarPagosPasarela, vincularPagoPasarela } from "@/lib/finanzas/pasarelas-acciones";
import { leerArchivoReporte } from "@/lib/finanzas/pasarelas/leer-archivo";
import { resumirPagos, type Lectura } from "@/lib/finanzas/pasarelas/lector";
import type { CandidatoPago, PagoSinEmparejar } from "@/lib/finanzas/consultas";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";

type Pasarela = { id: string; nombre: string };

const ACCEPT_REPORTE = ".xlsx,.xls,.csv,.txt,.tsv";

export function ReportePasarela({
  pasarelas,
  sinEmparejar,
  totalSinEmparejar,
  puedeCrear,
}: {
  pasarelas: Pasarela[];
  sinEmparejar: PagoSinEmparejar[];
  totalSinEmparejar: number;
  puedeCrear: boolean;
}) {
  const router = useRouter();
  const [cuentaId, setCuentaId] = useState<string | null>(pasarelas.length === 1 ? pasarelas[0].id : null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claveArchivo, setClaveArchivo] = useState(0);
  const nombre = new Map(pasarelas.map((p) => [p.id, p.nombre]));

  async function elegirArchivo(archivo: File | undefined) {
    setLectura(null);
    setError(null);
    if (!archivo) return;
    setLeyendo(true);
    setLectura(await leerArchivoReporte(archivo));
    setLeyendo(false);
  }

  async function importar() {
    if (!lectura?.ok) return;
    if (!cuentaId) return setError("Elige a qué pasarela pertenece el reporte.");
    setImportando(true);
    setError(null);
    const r = await importarPagosPasarela({ cuentaId, perfil: lectura.perfil, pagos: lectura.pagos });
    setImportando(false);
    if (r.error) return setError(r.error);
    toast.add({
      title: "Reporte importado",
      description: `${r.nuevos} pagos nuevos${r.repetidos ? `, ${r.repetidos} ya estaban` : ""}. ${r.emparejados} emparejados con su cobro${r.sinEmparejar ? `; ${r.sinEmparejar} esperan que elijas su cobro` : ""}.`,
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
      </span>
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
