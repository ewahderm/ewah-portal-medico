"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeftIcon, ArrowLeftRightIcon, ArrowUpRightIcon } from "lucide-react";
import { registrarMovimiento } from "@/lib/finanzas/movimientos-acciones";
import { subirArchivoFinanzas } from "@/lib/finanzas/subida-cliente";
import { validarMovimiento, valorEnPesos, type TipoMovimiento } from "@/lib/finanzas/movimientos";
import { formatoDinero, leerMonto } from "@/lib/finanzas/dinero";
import { TIPOS_CUENTA, etiqueta, type Moneda, type TipoCuenta } from "@/lib/finanzas/constantes";
import type { Categoria } from "@/lib/finanzas/consultas";
import { ACCEPT_ARCHIVO } from "@/lib/habilitacion/constantes";
import { cn } from "cn";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoDinero } from "./campo-dinero";
import { IconoCategoria } from "./icono-categoria";

export type CuentaOpcion = { id: string; nombre: string; tipo: TipoCuenta; moneda: Moneda; saldo: number; socio_id: string | null; activa: boolean };
type Opcion = { id: string; nombre: string };
type SocioOpcion = Opcion & { activo: boolean };

export type DatosRegistro = {
  hoy: string;
  fechaInicio: string;
  cuentas: CuentaOpcion[];
  categorias: Categoria[];
  socios: SocioOpcion[];
  proveedores: Opcion[];
  sedes: Opcion[];
  gestion: boolean;
};

const TITULOS: Record<TipoMovimiento, { titulo: string; ayuda: string }> = {
  egreso: { titulo: "Salió plata", ayuda: "Un gasto, un pago o una compra." },
  ingreso: { titulo: "Entró plata", ayuda: "Plata que recibió la clínica (los cobros de tratamientos llegarán solos)." },
  transferencia: { titulo: "Pasar plata entre cuentas", ayuda: "Consignar efectivo, pasar de Nequi al banco o comprar divisas." },
};

const CLASES_ACTIVO = [
  { value: "equipo_biomedico", label: "Equipo biomédico" },
  { value: "muebles_enseres", label: "Muebles y enseres" },
  { value: "equipo_computo", label: "Equipo de cómputo" },
  { value: "infraestructura", label: "Infraestructura (obras, adecuaciones)" },
];

// HU-4/HU-5/HU-10: un solo formulario en pasos, sin palabras contables.
export function RegistrarMovimientoBotones(datos: DatosRegistro & { puedeCrear: boolean }) {
  const [tipo, setTipo] = useState<TipoMovimiento | null>(null);
  if (!datos.puedeCrear) return null;
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button size="lg" className="h-14 text-base" onClick={() => setTipo("ingreso")}>
          <ArrowDownLeftIcon /> Entró plata
        </Button>
        <Button size="lg" variant="destructive" className="h-14 text-base" onClick={() => setTipo("egreso")}>
          <ArrowUpRightIcon /> Salió plata
        </Button>
        <Button size="lg" variant="outline" className="h-14 text-base" onClick={() => setTipo("transferencia")}>
          <ArrowLeftRightIcon /> Pasar entre cuentas
        </Button>
      </div>
      {tipo ? <RegistrarMovimientoDialog key={tipo} tipoInicial={tipo} datos={datos} onCerrar={() => setTipo(null)} /> : null}
    </>
  );
}

function RegistrarMovimientoDialog({ tipoInicial, datos, onCerrar }: { tipoInicial: TipoMovimiento; datos: DatosRegistro; onCerrar: () => void }) {
  const router = useRouter();
  const [id] = useState(() => crypto.randomUUID());
  const [tipo, setTipo] = useState<TipoMovimiento>(tipoInicial);
  const [monto, setMonto] = useState<number | null>(null);
  const [tasaTexto, setTasaTexto] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [cuentaDestinoId, setCuentaDestinoId] = useState<string | null>(null);
  const [montoDestino, setMontoDestino] = useState<number | null>(null);
  const [socioId, setSocioId] = useState<string | null>(null);
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [terceroNombre, setTerceroNombre] = useState("");
  const [sedeId, setSedeId] = useState<string | null>(null);
  const [fecha, setFecha] = useState(datos.hoy);
  const [descripcion, setDescripcion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [activoNombre, setActivoNombre] = useState("");
  const [activoClase, setActivoClase] = useState("equipo_biomedico");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  const cuenta = datos.cuentas.find((c) => c.id === cuentaId) ?? null;
  const destino = datos.cuentas.find((c) => c.id === cuentaDestinoId) ?? null;
  const moneda: Moneda = cuenta?.moneda ?? "COP";
  const tasa = moneda === "COP" ? null : leerMonto(tasaTexto);
  const cat = datos.categorias.find((c) => c.codigo === categoria) ?? null;
  const entreMonedas = tipo === "transferencia" && destino && destino.moneda !== moneda;

  const sociosActivos = datos.socios.filter((s) => s.activo);
  const cuentasActivas = datos.cuentas.filter((c) => c.activa);
  const categorias = useMemo(
    () => datos.categorias.filter((c) => c.activa && !c.automatica && (c.tipo === tipo || c.tipo === "ambos") && (datos.gestion || !["prestamo_socio", "aporte_socio"].includes(c.comportamiento))),
    [datos.categorias, datos.gestion, tipo],
  );
  // Egreso: cuentas disponibles y tarjetas de crédito; ingreso y transferencia: solo disponibles.
  // Transferir hacia la tarjeta de la empresa es pagarla.
  const cuentasOrigen = cuentasActivas.filter((c) =>
    c.tipo === "tarjeta_socio" ? tipo === "egreso" && datos.gestion : c.tipo === "tarjeta_empresa" ? tipo === "egreso" : c.tipo !== "pasarela",
  );
  const cuentasDestino = cuentasActivas.filter((c) => c.tipo !== "pasarela" && c.tipo !== "tarjeta_socio" && c.id !== cuentaId);
  // HU-4: aviso (sin bloquear) si una caja o billetera quedaría en negativo.
  const quedaNegativa =
    tipo !== "ingreso" && cuenta && ["efectivo", "nequi", "daviplata"].includes(cuenta.tipo) && monto !== null && monto > cuenta.saldo;
  const socioTarjeta = cuenta?.tipo === "tarjeta_socio" ? datos.socios.find((s) => s.id === cuenta.socio_id) : null;

  function cambiarTipo(t: TipoMovimiento) {
    setTipo(t);
    setCategoria(null);
    setSocioId(null);
    setProveedorId(null);
    setError(null);
    if (t !== "egreso" && (cuenta?.tipo === "tarjeta_socio" || cuenta?.tipo === "tarjeta_empresa")) setCuentaId(null);
  }

  function elegirCategoria(codigo: string) {
    setCategoria(codigo);
    const nueva = datos.categorias.find((c) => c.codigo === codigo);
    // El socio solo viaja con préstamos y aportes.
    if (!nueva || !["prestamo_socio", "aporte_socio"].includes(nueva.comportamiento)) setSocioId(null);
  }

  async function guardar() {
    const requiereSocio = cat?.comportamiento === "prestamo_socio";
    const e = validarMovimiento(
      {
        tipo,
        fecha,
        monto,
        moneda,
        tasa,
        categoria: tipo === "transferencia" ? null : categoria,
        cuentaId,
        cuentaDestinoId,
        monedaDestino: destino?.moneda ?? null,
        montoDestino,
        socioId,
        requiereSocio,
      },
      { hoy: datos.hoy, fechaInicio: datos.fechaInicio },
    );
    if (e) return setError(e);
    if (cat?.comportamiento === "activo_fijo" && activoNombre.trim().length < 3) return setError("Escribe qué activo se compró.");
    setPendiente(true);
    setError(null);
    let soporte: { path: string; nombre: string } | null = null;
    if (archivo) {
      const s = await subirArchivoFinanzas(archivo, "movimientos", id);
      if ("error" in s) {
        setPendiente(false);
        return setError(s.error);
      }
      soporte = s;
    }
    const r = await registrarMovimiento({
      id,
      tipo,
      fecha,
      monto,
      tasa,
      categoria: tipo === "transferencia" ? null : categoria,
      cuentaId,
      cuentaDestinoId: tipo === "transferencia" ? cuentaDestinoId : null,
      montoDestino: entreMonedas ? montoDestino : null,
      sedeId,
      proveedorId: tipo === "transferencia" ? null : proveedorId,
      socioId: tipo === "transferencia" ? null : socioId,
      terceroNombre: tipo === "transferencia" ? null : terceroNombre,
      descripcion,
      soportePath: soporte?.path ?? null,
      soporteNombre: soporte?.nombre ?? null,
      datosActivo: cat?.comportamiento === "activo_fijo" ? { nombre: activoNombre, clase: activoClase } : null,
    });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: tipo === "ingreso" ? "Entrada registrada" : tipo === "egreso" ? "Salida registrada" : "Transferencia registrada", type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{TITULOS[tipo].titulo}</DialogTitle>
          <DialogDescription>{TITULOS[tipo].ayuda}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Tipo de movimiento">
          {(["ingreso", "egreso", "transferencia"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              onClick={() => cambiarTipo(t)}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap", tipo === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {t === "ingreso" ? "Entró" : t === "egreso" ? "Salió" : "Entre cuentas"}
            </button>
          ))}
        </div>

        <div className="space-y-5">
          {/* 1. ¿Cuánto? */}
          <section className="space-y-2">
            <Label htmlFor={`monto-${id}`} className="text-sm font-semibold">
              1. ¿Cuánto? {moneda !== "COP" ? `(en ${moneda})` : ""}
            </Label>
            <div className="max-w-xs">
              <CampoDinero id={`monto-${id}`} moneda={moneda} onValor={setMonto} required />
            </div>
          </section>

          {/* 2. ¿En qué? */}
          {tipo !== "transferencia" ? (
            <section className="space-y-2">
              <p className="text-sm font-semibold">2. {tipo === "egreso" ? "¿En qué se gastó?" : "¿De qué es?"}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Categoría">
                {categorias.map((c) => (
                  <button
                    key={c.codigo}
                    type="button"
                    role="radio"
                    aria-checked={categoria === c.codigo}
                    title={c.ayuda}
                    onClick={() => elegirCategoria(c.codigo)}
                    className={cn(
                      "flex min-h-14 items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors",
                      categoria === c.codigo ? "border-primary bg-accent font-medium" : "hover:bg-muted",
                    )}
                  >
                    <IconoCategoria icono={c.icono} className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 break-words">{c.nombre}</span>
                  </button>
                ))}
              </div>
              {cat ? <p className="text-xs text-muted-foreground">{cat.ayuda}</p> : null}
            </section>
          ) : null}

          {/* 3. Cuentas */}
          <section className="space-y-2">
            <p className="text-sm font-semibold">
              {tipo === "transferencia" ? "2. ¿De qué cuenta sale?" : tipo === "egreso" ? "3. ¿Con qué se pagó?" : "3. ¿A dónde llegó?"}
            </p>
            <SelectorCuenta cuentas={cuentasOrigen} valor={cuentaId} onCambio={(v) => {
                setCuentaId(v);
                setTasaTexto("");
                if (v === cuentaDestinoId) setCuentaDestinoId(null);
              }} etiqueta="Cuenta" />
            {quedaNegativa ? (
              <p className="text-xs text-amber-700">
                {cuenta?.nombre} tiene {formatoDinero(cuenta?.saldo ?? 0, cuenta?.moneda)}: quedará en negativo. Revisa si la plata salió de otra cuenta.
              </p>
            ) : null}
            {socioTarjeta ? (
              <p className="text-xs text-amber-700">La clínica le quedará debiendo este gasto a {socioTarjeta.nombre} hasta que se le reembolse.</p>
            ) : null}
          </section>

          {tipo === "transferencia" ? (
            <section className="space-y-2">
              <p className="text-sm font-semibold">3. ¿A qué cuenta llega?</p>
              <SelectorCuenta cuentas={cuentasDestino} valor={cuentaDestinoId} onCambio={setCuentaDestinoId} etiqueta="Cuenta destino" />
              {entreMonedas ? (
                <div className="max-w-xs space-y-1">
                  <Label htmlFor={`montoDestino-${id}`}>¿Cuántos {destino?.moneda} llegaron?</Label>
                  <CampoDinero id={`montoDestino-${id}`} moneda={destino!.moneda} onValor={setMontoDestino} />
                </div>
              ) : null}
            </section>
          ) : null}

          {moneda !== "COP" ? (
            <section className="max-w-xs space-y-1">
              <Label htmlFor={`tasa-${id}`}>¿A cuánto estaba el {moneda} en pesos ese día?</Label>
              <Input id={`tasa-${id}`} inputMode="decimal" value={tasaTexto} onChange={(e) => setTasaTexto(e.target.value)} placeholder="Ej.: 4.150,50" />
              <p className="text-xs text-muted-foreground">
                {monto && tasa ? `Equivale a ${formatoDinero(valorEnPesos(monto, moneda, tasa))}` : "La tasa a la que realmente se cambió."}
              </p>
            </section>
          ) : null}

          {cat?.comportamiento === "prestamo_socio" || cat?.comportamiento === "aporte_socio" ? (
            <section className="max-w-sm space-y-1">
              <Label htmlFor={`socio-${id}`}>Socio{cat.comportamiento === "aporte_socio" ? " (opcional)" : ""}</Label>
              <Combobox id={`socio-${id}`} items={sociosActivos.map((s) => ({ value: s.id, label: s.nombre }))} value={socioId} onValueChange={(v) => setSocioId(v ? String(v) : null)} />
              {cat.comportamiento === "prestamo_socio" ? <p className="text-xs text-muted-foreground">Sin intereses. No es gasto ni ingreso: queda como deuda.</p> : null}
            </section>
          ) : null}

          {cat?.comportamiento === "activo_fijo" ? (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`activo-${id}`}>¿Qué se compró?</Label>
                <Input id={`activo-${id}`} value={activoNombre} maxLength={200} placeholder="Ej.: Láser CO2" onChange={(e) => setActivoNombre(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`claseActivo-${id}`}>Tipo</Label>
                <Combobox id={`claseActivo-${id}`} items={CLASES_ACTIVO} value={activoClase} onValueChange={(v) => setActivoClase(String(v ?? "equipo_biomedico"))} />
              </div>
            </section>
          ) : null}

          {/* 4. Detalle */}
          <section className="space-y-3 border-t pt-4">
            <p className="text-sm font-semibold">4. Detalle</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`fecha-${id}`}>Fecha</Label>
                <Input id={`fecha-${id}`} type="date" value={fecha} min={datos.fechaInicio} max={datos.hoy} onChange={(e) => setFecha(e.target.value)} />
              </div>
              {tipo !== "transferencia" ? (
                <div className="space-y-1">
                  <Label htmlFor={`proveedor-${id}`}>{tipo === "egreso" ? "¿A quién se le pagó? (opcional)" : "¿Quién pagó? (opcional)"}</Label>
                  {datos.proveedores.length && tipo === "egreso" ? (
                    <Combobox
                      id={`proveedor-${id}`}
                      items={datos.proveedores.map((p) => ({ value: p.id, label: p.nombre }))}
                      value={proveedorId}
                      onValueChange={(v) => setProveedorId(v ? String(v) : null)}
                      placeholder="Elige un proveedor o escribe abajo"
                    />
                  ) : null}
                  {!proveedorId ? (
                    <Input
                      id={datos.proveedores.length && tipo === "egreso" ? `tercero-${id}` : `proveedor-${id}`}
                      aria-label="Nombre de a quién"
                      value={terceroNombre}
                      maxLength={200}
                      placeholder="Nombre"
                      onChange={(e) => setTerceroNombre(e.target.value)}
                    />
                  ) : null}
                </div>
              ) : null}
              {datos.sedes.length > 1 ? (
                <div className="space-y-1">
                  <Label htmlFor={`sede-${id}`}>Sede (opcional)</Label>
                  <Combobox
                    id={`sede-${id}`}
                    items={[{ value: "", label: "General" }, ...datos.sedes.map((s) => ({ value: s.id, label: s.nombre }))]}
                    value={sedeId ?? ""}
                    placeholder="General"
                    onValueChange={(v) => setSedeId(v ? String(v) : null)}
                  />
                </div>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`descripcion-${id}`}>Nota (opcional)</Label>
              <Textarea id={`descripcion-${id}`} rows={2} maxLength={500} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`soporte-${id}`}>Factura o comprobante (opcional)</Label>
              <FileInput id={`soporte-${id}`} accept={ACCEPT_ARCHIVO} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            </div>
          </section>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="button" onClick={guardar} disabled={pendiente}>
              {pendiente ? "Guardando…" : "Registrar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SelectorCuenta({ cuentas, valor, onCambio, etiqueta: titulo }: { cuentas: CuentaOpcion[]; valor: string | null; onCambio: (id: string) => void; etiqueta: string }) {
  if (cuentas.length === 0) return <p className="text-sm text-muted-foreground">No hay cuentas disponibles.</p>;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={titulo}>
      {cuentas.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={valor === c.id}
          onClick={() => onCambio(c.id)}
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors",
            valor === c.id ? "border-primary bg-accent" : "hover:bg-muted",
          )}
        >
          <span className="min-w-0">
            <span className="block font-medium break-words">{c.nombre}</span>
            <span className="block text-xs text-muted-foreground">{etiqueta(TIPOS_CUENTA, c.tipo)}</span>
          </span>
          <span className={cn("shrink-0 text-xs tabular-nums", c.saldo < 0 ? "text-destructive" : "text-muted-foreground")}>
            {c.tipo === "tarjeta_socio" || c.tipo === "tarjeta_empresa" ? `Debe ${formatoDinero(Math.abs(c.saldo), c.moneda)}` : formatoDinero(c.saldo, c.moneda)}
          </span>
        </button>
      ))}
    </div>
  );
}
