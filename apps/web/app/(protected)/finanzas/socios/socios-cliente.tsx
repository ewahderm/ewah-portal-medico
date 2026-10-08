"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoIcon } from "lucide-react";
import { operarSocio } from "@/lib/finanzas/socios-acciones";
import { OPERACIONES, topeOperacion, validarOperacionSocio, type OperacionSocio, type SaldoSocio } from "@/lib/finanzas/socios";
import type { Movimiento } from "@/lib/finanzas/consultas";
import type { Moneda } from "@/lib/finanzas/constantes";
import { formatoDinero } from "@/lib/finanzas/dinero";
import { cn } from "cn";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoDinero } from "../_components/campo-dinero";
import { MovimientoFila } from "../_components/movimiento-fila";

type Tarjeta = { id: string; nombre: string; deuda: number };
type SocioVista = {
  id: string;
  nombre: string;
  activo: boolean;
  porcentaje: number | null;
  saldo: SaldoSocio | null;
  tarjetas: Tarjeta[];
  movimientos: Movimiento[];
};
type CuentaOpcion = { id: string; nombre: string; moneda: Moneda; disponible: boolean };

const SIN_SALDO: SaldoSocio = { socio_id: "", deuda_tarjeta: 0, tarjeta_a_favor: 0, prestado_por_socio: 0, prestado_a_socio: 0, aportes: 0, le_debemos: 0, nos_debe: 0 };

export function SociosCliente({
  socios,
  cuentas,
  categorias,
  hoy,
  fechaInicio,
  puedeCrear,
  puedeAnular,
}: {
  socios: SocioVista[];
  cuentas: CuentaOpcion[];
  categorias: { codigo: string; nombre: string }[];
  hoy: string;
  fechaInicio: string;
  puedeCrear: boolean;
  puedeAnular: boolean;
}) {
  const [operando, setOperando] = useState<{ socio: SocioVista; op: OperacionSocio } | null>(null);
  const nombreCategoria = new Map(categorias.map((c) => [c.codigo, c.nombre]));
  const nombreCuenta = new Map(cuentas.map((c) => [c.id, c.nombre]));
  const monedaCuenta = new Map(cuentas.map((c) => [c.id, c.moneda]));
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]));
  const totalLeDebemos = socios.reduce((t, s) => t + (s.saldo?.le_debemos ?? 0), 0);
  const totalNosDeben = socios.reduce((t, s) => t + (s.saldo?.nos_debe ?? 0), 0);

  if (!socios.length) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">No hay socios. Regístralos en Configuración → Socios.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Total titulo="La clínica les debe" valor={totalLeDebemos} detalle="Gastos con sus tarjetas y préstamos que hicieron" alerta={totalLeDebemos > 0} />
        <Total titulo="Los socios le deben a la clínica" valor={totalNosDeben} detalle="Préstamos que la clínica les hizo" />
      </div>

      {socios.map((s) => {
        const saldo = s.saldo ?? SIN_SALDO;
        return (
          <Card key={s.id}>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base font-semibold">
                  {s.nombre} {!s.activo ? <Badge variant="outline">Inactivo</Badge> : null}
                </CardTitle>
                {s.porcentaje !== null ? <p className="text-xs text-muted-foreground">{s.porcentaje} % de participación</p> : null}
              </div>
              {puedeCrear ? (
                <div className="flex flex-wrap gap-2">
                  {s.tarjetas.some((t) => t.deuda > 0) ? (
                    <Button size="sm" onClick={() => setOperando({ socio: s, op: "reembolso" })}>
                      Reembolsar tarjeta
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => setOperando({ socio: s, op: "prestamo_a_socio" })}>
                    Prestarle
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOperando({ socio: s, op: "prestamo_de_socio" })}>
                    Nos presta
                  </Button>
                  {saldo.prestado_a_socio > 0 ? (
                    <Button size="sm" variant="outline" onClick={() => setOperando({ socio: s, op: "socio_devuelve" })}>
                      Nos devuelve
                    </Button>
                  ) : null}
                  {saldo.prestado_por_socio > 0 ? (
                    <Button size="sm" variant="outline" onClick={() => setOperando({ socio: s, op: "clinica_devuelve" })}>
                      Le devolvemos
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-3">
                <Dato titulo="Gastos con su tarjeta por reembolsar" valor={saldo.deuda_tarjeta} alerta />
                <Dato titulo="Préstamos que nos hizo" valor={saldo.prestado_por_socio} alerta />
                <Dato titulo="Préstamos que le hicimos" valor={saldo.prestado_a_socio} />
              </dl>
              {saldo.tarjeta_a_favor > 0 ? (
                <p className="text-sm text-amber-700">
                  A su tarjeta se le reembolsaron {formatoDinero(saldo.tarjeta_a_favor)} de más: el socio los debe devolver (anula el reembolso
                  sobrante o regístralo de nuevo por el valor correcto).
                </p>
              ) : null}
              {s.tarjetas.length > 1 ? (
                <ul className="text-xs text-muted-foreground">
                  {s.tarjetas.map((t) => (
                    <li key={t.id}>
                      {t.nombre}: {t.deuda ? `se le deben ${formatoDinero(t.deuda)}` : "al día"}
                    </li>
                  ))}
                </ul>
              ) : null}
              {s.movimientos.length ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Últimos movimientos</p>
                  <ul className="divide-y">
                    {s.movimientos.map((m) => (
                      <MovimientoFila
                        key={m.id}
                        movimiento={m}
                        nombreCategoria={nombreCategoria}
                        nombreCuenta={nombreCuenta}
                        monedaCuenta={monedaCuenta}
                        nombreSocio={nombreSocio}
                        puedeAnular={puedeAnular}
                      />
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Alert>
        <InfoIcon />
        <AlertDescription>
          Los préstamos con socios no generan intereses (decisión de la clínica). Nota para el contador: la ley tributaria presume un interés
          mínimo en los préstamos de la sociedad a sus socios (art. 35 del Estatuto Tributario); se trata en la declaración de renta, no en el
          flujo de caja.
        </AlertDescription>
      </Alert>

      {operando ? (
        <OperacionDialog
          socio={operando.socio}
          op={operando.op}
          cuentas={cuentas.filter((c) => c.disponible)}
          hoy={hoy}
          fechaInicio={fechaInicio}
          onCerrar={() => setOperando(null)}
        />
      ) : null}
    </div>
  );
}

function Total({ titulo, valor, detalle, alerta }: { titulo: string; valor: number; detalle: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={cn("text-xl font-semibold tabular-nums", alerta && "text-amber-700")}>{formatoDinero(valor)}</p>
      <p className="text-xs text-muted-foreground">{detalle}</p>
    </div>
  );
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-lg border p-2">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className={cn("font-semibold tabular-nums", alerta && valor > 0 && "text-amber-700")}>{formatoDinero(valor)}</dd>
    </div>
  );
}

function OperacionDialog({
  socio,
  op,
  cuentas,
  hoy,
  fechaInicio,
  onCerrar,
}: {
  socio: SocioVista;
  op: OperacionSocio;
  cuentas: CuentaOpcion[];
  hoy: string;
  fechaInicio: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const info = OPERACIONES[op];
  const conDeuda = socio.tarjetas.filter((t) => t.deuda > 0);
  const [tarjetaId, setTarjetaId] = useState<string | null>(conDeuda[0]?.id ?? null);
  const tarjeta = socio.tarjetas.find((t) => t.id === tarjetaId);
  const tope = topeOperacion(op, socio.saldo ?? SIN_SALDO, tarjeta?.deuda);
  const [cuentaId, setCuentaId] = useState<string | null>(cuentas.length === 1 ? cuentas[0].id : null);
  const [fecha, setFecha] = useState(hoy);
  const [monto, setMonto] = useState<number | null>(tope);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const invalido = validarOperacionSocio({ monto, fecha, cuentaId, hoy, fechaInicio, tope });
    if (invalido) return setError(invalido);
    setPendiente(true);
    setError(null);
    const r = await operarSocio({ operacion: op, socioId: socio.id, tarjetaId, cuentaId, fecha, monto, nota });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Registrado", description: `${info.titulo}: ${formatoDinero(monto ?? 0)}`, type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {info.titulo} · {socio.nombre}
          </DialogTitle>
          <DialogDescription>{info.ayuda}</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {op === "reembolso" && conDeuda.length > 1 ? (
            <div className="space-y-1">
              <Label htmlFor="tarjetaSocio">Tarjeta</Label>
              <Combobox
                id="tarjetaSocio"
                items={conDeuda.map((t) => ({ value: t.id, label: `${t.nombre} (${formatoDinero(t.deuda)})` }))}
                value={tarjetaId}
                onValueChange={(v) => {
                  const id = v ? String(v) : null;
                  setTarjetaId(id);
                  setMonto(socio.tarjetas.find((t) => t.id === id)?.deuda ?? null);
                }}
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="cuentaSocio">{info.entra ? "¿A qué cuenta entra?" : "¿De qué cuenta sale?"}</Label>
            <Combobox id="cuentaSocio" items={cuentas.map((c) => ({ value: c.id, label: c.nombre }))} value={cuentaId} onValueChange={(v) => setCuentaId(v ? String(v) : null)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fechaSocio">Fecha</Label>
              <Input id="fechaSocio" type="date" value={fecha} min={fechaInicio} max={hoy} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="montoSocio">Valor</Label>
              <CampoDinero key={tarjetaId ?? "sin"} id="montoSocio" valorInicial={monto} onValor={setMonto} required />
              {tope !== null ? <p className="text-xs text-muted-foreground">Pendiente: {formatoDinero(tope)}</p> : null}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notaSocio">Nota (opcional)</Label>
            <Textarea id="notaSocio" rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : info.boton}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
