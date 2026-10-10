"use client";

import { useState, useTransition } from "react";
import { BanIcon, DownloadIcon, FileTextIcon, ReceiptIcon, XIcon } from "lucide-react";
import {
  anularCobroAtencion,
  cobrarAtencion,
  guardarFacturaCobro,
  quitarArchivoFactura,
  subirArchivoFactura,
  urlArchivoFactura,
  type CobroDeAtencion,
} from "@/lib/tratamientos/cobros";
import { FileInput } from "@/components/ui/file-input";
import { repartirTotal, sumaValores } from "@/lib/tratamientos/precios";
import { formatoMoneda, hoy } from "@/lib/format";
import { toItems, type Opcion } from "@/lib/forms/opciones";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AvisoCatalogoVacio } from "../_components/aviso-catalogo-vacio";

export type TratamientoPorCobrar = {
  id: string;
  nombre: string;
  precio: number | null;
  // Lo que se iba a cobrar por él (precio o el valor indicado al registrarlo).
  cobrado: number;
};

// El paciente paga la atención completa: un solo cobro con su medio de pago
// por el total. El descuento se escribe en el total y se reparte entre los
// tratamientos marcados, en proporción a su valor; cada valor se puede
// ajustar a mano. Lo guardado alimenta el análisis de ventas por tratamiento.
export function CobrarAtencionDialog({
  atencionId,
  tratamientos,
  mediosPago,
  onCobrado,
}: {
  atencionId: string;
  tratamientos: TratamientoPorCobrar[];
  mediosPago: Opcion[];
  onCobrado: () => void;
}) {
  const [open, setOpen] = useState(false);
  const base = Object.fromEntries(tratamientos.map((t) => [t.id, t.cobrado]));
  const [valores, setValores] = useState<Record<string, number>>(base);
  const [conDescuento, setConDescuento] = useState<Record<string, boolean>>(
    Object.fromEntries(tratamientos.map((t) => [t.id, true])),
  );
  const [total, setTotal] = useState(String(sumaValores(base)));
  const [fecha, setFecha] = useState(hoy());
  const [medio, setMedio] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suma = sumaValores(valores);
  const sinDescuento = sumaValores(base);
  const descuento = sinDescuento - suma;

  function reiniciar() {
    setValores(base);
    setConDescuento(Object.fromEntries(tratamientos.map((t) => [t.id, true])));
    setTotal(String(sumaValores(base)));
    setFecha(hoy());
    setMedio("");
    setNotas("");
    setError(null);
  }

  function aplicarTotal(texto: string, marcas = conDescuento) {
    setTotal(texto);
    if (texto === "") return;
    const r = repartirTotal(
      tratamientos.map((t) => ({ id: t.id, base: base[t.id], aplicaDescuento: marcas[t.id] })),
      Number(texto),
    );
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setError(null);
    setValores(r.valores);
  }

  function cambiarValor(id: string, texto: string) {
    const v = texto === "" ? 0 : Number(texto);
    if (!Number.isFinite(v) || v < 0) return;
    const nuevos = { ...valores, [id]: Math.round(v) };
    setValores(nuevos);
    setTotal(String(sumaValores(nuevos)));
    setError(null);
  }

  function cobrar() {
    setError(null);
    startTransition(async () => {
      const r = await cobrarAtencion({
        atencionId,
        fecha,
        medioPagoId: medio,
        items: tratamientos.map((t) => ({ tratamientoId: t.id, valor: valores[t.id] ?? 0 })),
        notas,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      toast.add({ title: `Atención cobrada: ${formatoMoneda(suma)}`, type: "success" });
      setOpen(false);
      onCobrado();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reiniciar();
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <ReceiptIcon /> Cobrar atención
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cobrar atención</DialogTitle>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm font-medium">Tratamientos</p>
          <ul className="space-y-2">
            {tratamientos.map((t) => (
              <li key={t.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-medium">{t.nombre}</span>
                  {t.precio !== null ? (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">Precio {formatoMoneda(t.precio)}</span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={conDescuento[t.id]}
                      onCheckedChange={(v) => {
                        const marcas = { ...conDescuento, [t.id]: Boolean(v) };
                        setConDescuento(marcas);
                        // Sin descuento vuelve a su valor; el total se reparte de nuevo.
                        if (!v) {
                          const nuevos = { ...valores, [t.id]: base[t.id] };
                          setValores(nuevos);
                        }
                        aplicarTotal(total, marcas);
                      }}
                    />
                    Aplica descuento
                  </label>
                  <Input
                    aria-label={`Valor cobrado de ${t.nombre}`}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1000"
                    className="ml-auto max-w-40 text-right tabular-nums"
                    value={String(valores[t.id] ?? 0)}
                    onChange={(e) => cambiarValor(t.id, e.target.value)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="cobro-total" className="shrink-0">
              Total a cobrar
            </Label>
            <Input
              id="cobro-total"
              type="number"
              inputMode="numeric"
              min="0"
              step="1000"
              className="max-w-44 text-right text-base font-semibold tabular-nums"
              value={total}
              onChange={(e) => aplicarTotal(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Suma de los tratamientos: {formatoMoneda(sinDescuento)}
            {descuento > 0 ? ` · descuento ${formatoMoneda(descuento)}` : descuento < 0 ? ` · recargo ${formatoMoneda(-descuento)}` : ""}.
            Escribe el total y se reparte entre los que aplica descuento.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cobro-medio">Medio de pago</Label>
            <Combobox
              id="cobro-medio"
              items={toItems(mediosPago)}
              value={medio}
              onValueChange={(v) => setMedio(String(v ?? ""))}
              placeholder="Selecciona"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cobro-fecha">Fecha del cobro</Label>
            <Input id="cobro-fecha" type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        {mediosPago.length === 0 ? (
          <AvisoCatalogoVacio>
            Todavía no tienes medios de pago (efectivo, datáfono, transferencia...). Créalos en Parámetros → Tratamientos → Medios de pago.
          </AvisoCatalogoVacio>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="cobro-notas">Notas (opcional)</Label>
          <Textarea id="cobro-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: descuento por paquete" />
        </div>

        <Button className="w-full" disabled={pending || !medio || suma < 0 || error !== null} onClick={cobrar}>
          {pending ? "Cobrando..." : `Cobrar ${formatoMoneda(suma)}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function AnularCobroDialog({ cobroId, valor, onAnulado }: { cobroId: string; valor: number | null; onAnulado: () => void }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function anular() {
    setError(null);
    startTransition(async () => {
      const r = await anularCobroAtencion(cobroId, motivo);
      if (r.error) {
        setError(r.error);
        return;
      }
      toast.add({ title: "Cobro anulado", type: "success" });
      setOpen(false);
      setMotivo("");
      onAnulado();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="icon-sm" aria-label="Anular cobro">
            <BanIcon />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular cobro de {formatoMoneda(valor)}</DialogTitle>
        </DialogHeader>
        <Alert>
          <AlertDescription>
            El cobro no se borra: queda anulado en el historial y su ingreso sale del flujo de caja. Los tratamientos vuelven a
            quedar sin cobrar para cobrarlos de nuevo.
          </AlertDescription>
        </Alert>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="cobro-motivo">Motivo</Label>
          <Textarea
            id="cobro-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: el paciente pagó con otra tarjeta"
          />
        </div>
        <Button variant="destructive" className="w-full" disabled={pending || motivo.trim().length < 10} onClick={anular}>
          {pending ? "Anulando..." : "Confirmar anulación"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// Factura electrónica del cobro: número, CUFE y los archivos (PDF/XML) que
// emite el sistema de facturación. Se registra después de cobrar y se puede
// corregir (cada cambio queda en la auditoría); lo cobrado no cambia.
export function FacturaCobroDialog({
  cobro,
  editable,
  onGuardado,
}: {
  cobro: CobroDeAtencion;
  editable: boolean;
  onGuardado: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [numero, setNumero] = useState(cobro.factura_numero ?? "");
  const [cufe, setCufe] = useState(cobro.factura_cufe ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tiene = Boolean(cobro.factura_numero || cobro.factura_cufe || cobro.factura_pdf_path || cobro.factura_xml_path);
  const cufeLimpio = cufe.replace(/s/g, "");
  const cufeIncompleto = cufeLimpio !== "" && !/^[0-9a-fA-F]{96}$/.test(cufeLimpio);

  function guardar() {
    setError(null);
    startTransition(async () => {
      const r = await guardarFacturaCobro({ cobroId: cobro.id, numero, cufe });
      if (r.error) return setError(r.error);
      toast.add({ title: "Factura guardada", type: "success" });
      onGuardado();
    });
  }

  function subir(tipo: "pdf" | "xml", input: HTMLInputElement) {
    const archivo = input.files?.[0];
    if (!archivo) return;
    setError(null);
    const datos = new FormData();
    datos.append("archivo", archivo);
    startTransition(async () => {
      const r = await subirArchivoFactura(cobro.id, tipo, datos);
      input.value = "";
      if (r.error) return setError(r.error);
      toast.add({ title: tipo === "pdf" ? "PDF de la factura subido" : "XML de la factura subido", type: "success" });
      onGuardado();
    });
  }

  function quitar(tipo: "pdf" | "xml") {
    setError(null);
    startTransition(async () => {
      const r = await quitarArchivoFactura(cobro.id, tipo);
      if (r.error) return setError(r.error);
      onGuardado();
    });
  }

  async function descargar(path: string) {
    const url = await urlArchivoFactura(path);
    if (url) window.open(url, "_blank", "noopener");
    else setError("No se pudo descargar el archivo.");
  }

  const archivo = (tipo: "pdf" | "xml", path: string | null) => (
    <div className="space-y-2">
      <Label>{tipo === "pdf" ? "PDF de la factura" : "XML de la factura"}</Label>
      {path ? (
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{path.split("/").pop()}</span>
          <Button variant="outline" size="icon-sm" aria-label={`Descargar ${tipo.toUpperCase()}`} onClick={() => descargar(path)}>
            <DownloadIcon />
          </Button>
          {editable ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Quitar ${tipo.toUpperCase()}`} disabled={pending} onClick={() => quitar(tipo)}>
              <XIcon />
            </Button>
          ) : null}
        </div>
      ) : null}
      {editable ? (
        <FileInput
          accept={tipo === "pdf" ? "application/pdf,.pdf" : ".xml,application/xml,text/xml"}
          aria-label={path ? `Reemplazar ${tipo.toUpperCase()}` : `Subir ${tipo.toUpperCase()}`}
          disabled={pending}
          onChange={(e) => subir(tipo, e.currentTarget)}
        />
      ) : !path ? (
        <p className="text-sm text-muted-foreground">Sin archivo.</p>
      ) : null}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setNumero(cobro.factura_numero ?? "");
          setCufe(cobro.factura_cufe ?? "");
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button variant={tiene ? "outline" : "secondary"} size="xs" aria-label="Factura electrónica">
            <FileTextIcon /> {tiene ? "Factura" : "Agregar factura"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Factura electrónica · {formatoMoneda(cobro.valor)}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          La factura que emitiste por este cobro. Puedes agregarla o corregirla en cualquier momento; cada cambio queda registrado.
        </p>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="factura-numero">Número de factura</Label>
          <Input id="factura-numero" value={numero} readOnly={!editable} maxLength={40} onChange={(e) => setNumero(e.target.value)} placeholder="Ej: FE-1234" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="factura-cufe">CUFE</Label>
          <Textarea
            id="factura-cufe"
            rows={3}
            value={cufe}
            readOnly={!editable}
            onChange={(e) => setCufe(e.target.value)}
            className="font-mono text-xs break-all"
            placeholder="Pega el CUFE completo (96 caracteres)"
          />
          <p className={cufeIncompleto ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {cufeIncompleto
              ? `Tiene ${cufeLimpio.length} caracteres: el CUFE completo tiene 96 (números y letras de la a a la f).`
              : "Sale en la factura y en el XML. Con él se consulta la factura en la DIAN."}
          </p>
        </div>
        {editable ? (
          <Button className="w-full" disabled={pending || cufeIncompleto} onClick={guardar}>
            {pending ? "Guardando..." : "Guardar número y CUFE"}
          </Button>
        ) : null}
        <div className="space-y-4 border-t pt-4">
          {archivo("pdf", cobro.factura_pdf_path)}
          {archivo("xml", cobro.factura_xml_path)}
        </div>
      </DialogContent>
    </Dialog>
  );
}
