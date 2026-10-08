"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { activarFinanzas } from "@/lib/finanzas/configuracion";
import { MONEDAS, TIPOS_CUENTA, etiqueta, type Moneda } from "@/lib/finanzas/constantes";
import { validarAsistente, type CuentaEntrada, type SocioEntrada } from "@/lib/finanzas/cuentas";
import { formatoDinero, leerMonto } from "@/lib/finanzas/dinero";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { cn } from "cn";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoDinero } from "./_components/campo-dinero";

type Paso = "fecha" | "socios" | "cuentas" | "confirmar";
type FilaCuenta = CuentaEntrada & { clave: number; saldoValido: boolean };
type FilaSocio = { clave: number; nombre: string; numeroIdentificacion: string; porcentajeTexto: string };

let siguienteClave = 1;
const nuevaCuenta = (p: Partial<CuentaEntrada> = {}): FilaCuenta => ({
  clave: siguienteClave++,
  nombre: "",
  tipo: "banco",
  moneda: "COP",
  saldo: 0,
  socioIndice: null,
  saldoValido: true,
  ...p,
});

function primeroDelMes(hoy: string) {
  return `${hoy.slice(0, 8)}01`;
}

// HU-0: fecha de inicio → socios (Pro) → cuentas con su saldo a esa fecha →
// confirmar. Todo se guarda en una sola llamada (fn_fin_activar).
export function AsistenteArranque({ hoy, gestion }: { hoy: string; gestion: boolean }) {
  const router = useRouter();
  const pasos: Paso[] = gestion ? ["fecha", "socios", "cuentas", "confirmar"] : ["fecha", "cuentas", "confirmar"];
  const [paso, setPaso] = useState<Paso>("fecha");
  const [fecha, setFecha] = useState(primeroDelMes(hoy));
  const [socios, setSocios] = useState<FilaSocio[]>([]);
  const [cuentas, setCuentas] = useState<FilaCuenta[]>(() => [
    nuevaCuenta({ nombre: "Efectivo", tipo: "efectivo" }),
    nuevaCuenta({ nombre: "Banco principal", tipo: "banco" }),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  const sociosEntrada: SocioEntrada[] = socios.map((s) => ({
    nombre: s.nombre,
    numeroIdentificacion: s.numeroIdentificacion,
    porcentaje: s.porcentajeTexto.trim() ? leerMonto(s.porcentajeTexto) : null,
  }));
  const indice = pasos.indexOf(paso);

  function validarPaso(p: Paso): string | null {
    const entrada = { fechaInicio: fecha, hoy, socios: sociosEntrada, cuentas };
    if (p === "fecha") {
      return validarAsistente({ ...entrada, socios: [], cuentas: [nuevaCuenta({ nombre: "x", tipo: "efectivo" })] }, gestion);
    }
    if (p === "socios") {
      if (socios.some((s) => s.porcentajeTexto.trim() && leerMonto(s.porcentajeTexto) === null)) return "Revisa la participación de los socios.";
      return validarAsistente({ ...entrada, cuentas: [nuevaCuenta({ nombre: "x", tipo: "efectivo" })] }, gestion);
    }
    if (cuentas.some((c) => !c.saldoValido)) return "Revisa los saldos: alguno no es un número.";
    return validarAsistente(entrada, gestion);
  }

  function avanzar() {
    const e = validarPaso(paso);
    setError(e);
    if (!e) setPaso(pasos[indice + 1]);
  }

  async function activar() {
    const e = validarPaso("cuentas");
    if (e) return setError(e);
    setPendiente(true);
    setError(null);
    const r = await activarFinanzas({
      fechaInicio: fecha,
      socios: sociosEntrada,
      cuentas: cuentas.map(({ nombre, tipo, moneda, saldo, socioIndice }) => ({ nombre, tipo, moneda, saldo, socioIndice })),
    });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Flujo de caja activado", type: "success" });
    router.refresh();
  }

  const actualizarCuenta = (clave: number, cambio: Partial<FilaCuenta>) =>
    setCuentas((cs) => cs.map((c) => (c.clave === clave ? { ...c, ...cambio } : c)));
  const actualizarSocio = (clave: number, cambio: Partial<FilaSocio>) =>
    setSocios((ss) => ss.map((s) => (s.clave === clave ? { ...s, ...cambio } : s)));

  const tiposDisponibles = TIPOS_CUENTA.filter((t) => gestion || !t.pro).filter((t) => t.value !== "tarjeta_socio" || socios.length > 0);

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader className="space-y-3">
        <CardTitle className="text-base font-semibold">Empecemos con tu flujo de caja</CardTitle>
        <ol className="flex flex-wrap gap-2 text-xs" aria-label="Pasos">
          {pasos.map((p, i) => (
            <li
              key={p}
              aria-current={p === paso ? "step" : undefined}
              className={cn(
                "rounded-full border px-2.5 py-1",
                p === paso ? "border-primary bg-primary text-primary-foreground" : i < indice ? "border-primary/40 text-foreground" : "text-muted-foreground",
              )}
            >
              {i + 1}. {{ fecha: "Fecha de inicio", socios: "Socios", cuentas: "Cuentas", confirmar: "Confirmar" }[p]}
            </li>
          ))}
        </ol>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {paso === "fecha" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Desde esta fecha llevarás la caja en EWAH. Puede ser hoy o una fecha pasada (por ejemplo, el primero del mes o del
              año) si tienes los saldos de tus cuentas a ese día. Los cobros de los tratamientos registrados desde esa fecha se
              tomarán como ingresos cuando esa parte esté lista.
            </p>
            <div className="max-w-xs space-y-2">
              <Label htmlFor="fechaInicio">Fecha de inicio</Label>
              <Input id="fechaInicio" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required />
            </div>
          </div>
        ) : null}

        {paso === "socios" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Registra a los socios si alguno paga gastos de la clínica con su tarjeta de crédito o le presta plata a la clínica.
              Puedes saltar este paso y agregarlos después.
            </p>
            {socios.map((s, i) => (
              <div key={s.clave} className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_7rem_auto] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor={`socioNombre-${s.clave}`}>Nombre</Label>
                  <Input id={`socioNombre-${s.clave}`} value={s.nombre} maxLength={200} onChange={(e) => actualizarSocio(s.clave, { nombre: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`socioId-${s.clave}`}>Identificación</Label>
                  <Input id={`socioId-${s.clave}`} value={s.numeroIdentificacion} maxLength={20} onChange={(e) => actualizarSocio(s.clave, { numeroIdentificacion: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`socioPct-${s.clave}`}>% (opcional)</Label>
                  <Input id={`socioPct-${s.clave}`} inputMode="decimal" value={s.porcentajeTexto} onChange={(e) => actualizarSocio(s.clave, { porcentajeTexto: e.target.value })} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quitar socio ${i + 1}`}
                  onClick={() => {
                    setSocios((ss) => ss.filter((x) => x.clave !== s.clave));
                    // Las tarjetas apuntan al socio por posición: se reajustan.
                    setCuentas((cs) =>
                      cs
                        .filter((c) => !(c.tipo === "tarjeta_socio" && c.socioIndice === i))
                        .map((c) => (c.tipo === "tarjeta_socio" && (c.socioIndice ?? 0) > i ? { ...c, socioIndice: (c.socioIndice ?? 0) - 1 } : c)),
                    );
                  }}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setSocios((ss) => [...ss, { clave: siguienteClave++, nombre: "", numeroIdentificacion: "", porcentajeTexto: "" }])}>
              <PlusIcon /> Agregar socio
            </Button>
          </div>
        ) : null}

        {paso === "cuentas" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              ¿Por dónde se mueve la plata de la clínica? Escribe cuánto había en cada cuenta el {fechaLegible(fecha)}.
              {gestion ? " Si un socio paga gastos con su tarjeta, agrégala y escribe lo que la clínica ya le debía." : ""}
            </p>
            {cuentas.map((c, i) => (
              <div key={c.clave} className="space-y-3 rounded-lg border p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label htmlFor={`cuentaTipo-${c.clave}`}>Tipo</Label>
                    <Combobox
                      id={`cuentaTipo-${c.clave}`}
                      items={tiposDisponibles.map((t) => ({ value: t.value, label: t.label }))}
                      value={c.tipo}
                      onValueChange={(v) =>
                        actualizarCuenta(c.clave, {
                          tipo: String(v ?? "banco"),
                          moneda: v === "efectivo" ? c.moneda : "COP",
                          socioIndice: v === "tarjeta_socio" ? (c.socioIndice ?? 0) : null,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`cuentaNombre-${c.clave}`}>Nombre</Label>
                    <Input
                      id={`cuentaNombre-${c.clave}`}
                      value={c.nombre}
                      maxLength={60}
                      placeholder={c.tipo === "banco" ? "Ej.: Bancolombia ahorros" : etiqueta(TIPOS_CUENTA, c.tipo)}
                      onChange={(e) => actualizarCuenta(c.clave, { nombre: e.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar cuenta ${i + 1}`}
                    disabled={cuentas.length === 1}
                    onClick={() => setCuentas((cs) => cs.filter((x) => x.clave !== c.clave))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {c.tipo === "efectivo" ? (
                    <div className="space-y-1">
                      <Label htmlFor={`cuentaMoneda-${c.clave}`}>Moneda</Label>
                      <Combobox
                        id={`cuentaMoneda-${c.clave}`}
                        items={MONEDAS.map((m) => ({ value: m.value, label: m.label }))}
                        value={c.moneda}
                        onValueChange={(v) => actualizarCuenta(c.clave, { moneda: String(v ?? "COP") })}
                      />
                    </div>
                  ) : null}
                  {c.tipo === "tarjeta_socio" ? (
                    <div className="space-y-1">
                      <Label htmlFor={`cuentaSocio-${c.clave}`}>Socio</Label>
                      <Combobox
                        id={`cuentaSocio-${c.clave}`}
                        items={socios.map((s, j) => ({ value: String(j), label: s.nombre || `Socio ${j + 1}` }))}
                        value={c.socioIndice === null || c.socioIndice === undefined ? null : String(c.socioIndice)}
                        onValueChange={(v) => actualizarCuenta(c.clave, { socioIndice: v === null ? null : Number(v) })}
                      />
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label htmlFor={`cuentaSaldo-${c.clave}`}>
                      {c.tipo === "tarjeta_socio" ? "Lo que la clínica le debía al socio" : c.tipo === "pasarela" ? "Cobros por abonar" : "Saldo"} ({c.moneda})
                    </Label>
                    <CampoDinero
                      key={`${c.clave}-${c.moneda}`}
                      id={`cuentaSaldo-${c.clave}`}
                      moneda={c.moneda as Moneda}
                      valorInicial={c.saldo || null}
                      permitirNegativo={c.tipo === "banco"}
                      onValor={(v) => actualizarCuenta(c.clave, { saldo: v ?? 0, saldoValido: v !== null })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setCuentas((cs) => [...cs, nuevaCuenta({ tipo: "nequi" })])}>
              <PlusIcon /> Agregar cuenta
            </Button>
          </div>
        ) : null}

        {paso === "confirmar" ? (
          <div className="space-y-3 text-sm">
            <p>
              Empiezas el <strong>{fechaLegible(fecha)}</strong> con:
            </p>
            <ul className="divide-y rounded-lg border">
              {cuentas.map((c) => (
                <li key={c.clave} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span>
                    <span className="font-medium">{c.nombre.trim()}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      {etiqueta(TIPOS_CUENTA, c.tipo)}
                      {c.tipo === "tarjeta_socio" && c.socioIndice !== null && c.socioIndice !== undefined ? ` · ${socios[c.socioIndice]?.nombre ?? ""}` : ""}
                    </span>
                  </span>
                  <span className={c.tipo === "tarjeta_socio" && c.saldo > 0 ? "text-destructive" : undefined}>
                    {c.tipo === "tarjeta_socio" ? "Se le debe " : ""}
                    {formatoDinero(c.saldo, c.moneda as Moneda)}
                  </span>
                </li>
              ))}
            </ul>
            {socios.length ? <p className="text-muted-foreground">Socios: {socios.map((s) => s.nombre.trim()).join(", ")}.</p> : null}
            <p className="text-xs text-muted-foreground">
              Podrás cambiar la fecha de inicio, los saldos iniciales y agregar cuentas o socios en Configuración.
            </p>
          </div>
        ) : null}

        <div className="flex justify-between gap-2 border-t pt-4">
          <Button type="button" variant="outline" disabled={indice === 0 || pendiente} onClick={() => {
              setError(null);
              setPaso(pasos[indice - 1]);
            }}>
            <ArrowLeftIcon /> Atrás
          </Button>
          {paso === "confirmar" ? (
            <Button type="button" onClick={activar} disabled={pendiente}>
              {pendiente ? "Activando…" : "Activar flujo de caja"}
            </Button>
          ) : (
            <Button type="button" onClick={avanzar}>
              {paso === "socios" && socios.length === 0 ? "Saltar" : "Siguiente"} <ArrowRightIcon />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
