"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";
import {
  cambiarEstadoCuenta,
  cambiarFechaInicio,
  crearCategoriaPropia,
  guardarCuenta,
  guardarSocio,
  personalizarCategoria,
} from "@/lib/finanzas/configuracion";
import { ACTIVIDADES, MONEDAS, TIPOS_CUENTA, etiqueta, type Moneda } from "@/lib/finanzas/constantes";
import { saldoParaMostrar } from "@/lib/finanzas/cuentas";
import { formatoDinero, leerMonto } from "@/lib/finanzas/dinero";
import type { Categoria, Cuenta, Socio } from "@/lib/finanzas/consultas";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { cn } from "cn";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampoDinero } from "../_components/campo-dinero";

type Opcion = { id: string; nombre: string };

type Props = {
  tab: string;
  hoy: string;
  fechaInicio: string;
  cuentas: Cuenta[];
  socios: Socio[];
  categorias: Categoria[];
  tiposIdentificacion: Opcion[];
  empleados: Opcion[];
  puedeEditar: boolean;
  gestion: boolean;
};

const TABS = ["general", "cuentas", "socios", "categorias"];

export function ConfiguracionCliente(props: Props) {
  return (
    <Tabs defaultValue={TABS.includes(props.tab) ? props.tab : "general"}>
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="cuentas">Cuentas</TabsTrigger>
        <TabsTrigger value="socios">Socios</TabsTrigger>
        <TabsTrigger value="categorias">Categorías</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="pt-4">
        <General {...props} />
      </TabsContent>
      <TabsContent value="cuentas" className="pt-4">
        <Cuentas {...props} />
      </TabsContent>
      <TabsContent value="socios" className="pt-4">
        <Socios {...props} />
      </TabsContent>
      <TabsContent value="categorias" className="pt-4">
        <Categorias {...props} />
      </TabsContent>
    </Tabs>
  );
}

function MensajeError({ mensaje }: { mensaje: string | null }) {
  return mensaje ? (
    <Alert variant="destructive">
      <AlertDescription>{mensaje}</AlertDescription>
    </Alert>
  ) : null;
}

// ------------------------------------------------------------ General
function General({ hoy, fechaInicio, puedeEditar }: Props) {
  const router = useRouter();
  const [inicial] = useState(fechaInicio);
  const [fecha, setFecha] = useState(fechaInicio);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function guardar() {
    setPendiente(true);
    setError(null);
    const r = await cambiarFechaInicio(fecha);
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Fecha de inicio actualizada", type: "success" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Fecha de inicio</CardTitle>
        <p className="text-sm text-muted-foreground">
          Desde el {fechaLegible(inicial)} llevas la caja en EWAH. Los saldos iniciales de las cuentas son a esa fecha. Podrás
          cambiarla mientras no hayas cerrado ningún mes.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <MensajeError mensaje={error} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2 sm:w-56">
            <Label htmlFor="fechaInicioConfig">Fecha de inicio</Label>
            <Input id="fechaInicioConfig" type="date" value={fecha} max={hoy} disabled={!puedeEditar} onChange={(e) => setFecha(e.target.value)} />
          </div>
          {puedeEditar ? (
            <Button onClick={guardar} disabled={pendiente || fecha === inicial || !fecha}>
              {pendiente ? "Guardando…" : "Cambiar fecha"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ Cuentas
function Cuentas({ cuentas, socios, puedeEditar, gestion }: Props) {
  const [editando, setEditando] = useState<Cuenta | "nueva" | null>(null);
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]));
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Cuentas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Por dónde se mueve la plata. Una cuenta no se borra: se desactiva y su historia se conserva.
          </p>
        </div>
        {puedeEditar ? (
          <Button size="sm" onClick={() => setEditando("nueva")}>
            <PlusIcon /> Nueva cuenta
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {cuentas.map((c) => (
            <li key={c.id} className={cn("flex flex-wrap items-center gap-3 py-3", !c.activa && "opacity-60")}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {c.nombre} {!c.activa ? <Badge variant="outline">Inactiva</Badge> : null}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {etiqueta(TIPOS_CUENTA, c.tipo)} · {c.moneda}
                  {c.socio_id ? ` · ${nombreSocio.get(c.socio_id) ?? ""}` : ""}
                  {c.ultimos_digitos ? ` · ****${c.ultimos_digitos}` : ""}
                </span>
              </span>
              <span className="text-right text-sm tabular-nums">
                <span className="block text-xs text-muted-foreground">{c.tipo === "tarjeta_socio" ? "Deuda inicial" : "Saldo inicial"}</span>
                {formatoDinero(saldoParaMostrar(c.tipo, c.saldo_inicial), c.moneda)}
              </span>
              {puedeEditar ? <EstadoCuenta cuenta={c} /> : null}
              {puedeEditar ? (
                <Button variant="outline" size="icon-sm" aria-label={`Editar ${c.nombre}`} onClick={() => setEditando(c)}>
                  <PencilIcon />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
      {editando ? (
        <CuentaDialog
          cuenta={editando === "nueva" ? null : editando}
          socios={socios.filter((s) => s.activo)}
          gestion={gestion}
          onCerrar={() => setEditando(null)}
        />
      ) : null}
    </Card>
  );
}

function EstadoCuenta({ cuenta }: { cuenta: Cuenta }) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch
        checked={cuenta.activa}
        disabled={pendiente}
        aria-label={`${cuenta.activa ? "Desactivar" : "Activar"} ${cuenta.nombre}`}
        onCheckedChange={async (activa) => {
          setPendiente(true);
          const r = await cambiarEstadoCuenta(cuenta.id, activa);
          setPendiente(false);
          if (r.error) return toast.add({ title: "No se actualizó", description: r.error, type: "error" });
          router.refresh();
        }}
      />
      Activa
    </label>
  );
}

function CuentaDialog({ cuenta, socios, gestion, onCerrar }: { cuenta: Cuenta | null; socios: Socio[]; gestion: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<string>(cuenta?.tipo ?? "banco");
  const [moneda, setMoneda] = useState<string>(cuenta?.moneda ?? "COP");
  const [socioId, setSocioId] = useState<string | null>(cuenta?.socio_id ?? null);
  const [nombre, setNombre] = useState(cuenta?.nombre ?? "");
  const [digitos, setDigitos] = useState(cuenta?.ultimos_digitos ?? "");
  const [saldo, setSaldo] = useState<number | null>(cuenta ? saldoParaMostrar(cuenta.tipo, cuenta.saldo_inicial) : 0);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const tipos = TIPOS_CUENTA.filter((t) => (gestion || !t.pro) && (t.value !== "tarjeta_socio" || socios.length > 0));

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (saldo === null) return setError("Revisa el saldo: no es un número.");
    setPendiente(true);
    setError(null);
    const r = await guardarCuenta({ id: cuenta?.id ?? null, nombre, tipo, moneda, saldo, socioId, ultimosDigitos: digitos || null });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: cuenta ? "Cuenta actualizada" : "Cuenta creada", type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cuenta ? `Editar ${cuenta.nombre}` : "Nueva cuenta"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <MensajeError mensaje={error} />
          {cuenta ? (
            <p className="text-sm text-muted-foreground">
              {etiqueta(TIPOS_CUENTA, cuenta.tipo)} en {cuenta.moneda}. El tipo, la moneda y el socio no cambian: si hace falta,
              crea otra cuenta y desactiva esta.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="tipoCuenta">Tipo</Label>
                <Combobox
                  id="tipoCuenta"
                  items={tipos.map((t) => ({ value: t.value, label: t.label }))}
                  value={tipo}
                  onValueChange={(v) => {
                    setTipo(String(v ?? "banco"));
                    if (v !== "efectivo") setMoneda("COP");
                  }}
                />
              </div>
              {tipo === "efectivo" ? (
                <div className="space-y-1">
                  <Label htmlFor="monedaCuenta">Moneda</Label>
                  <Combobox id="monedaCuenta" items={MONEDAS.map((m) => ({ value: m.value, label: m.label }))} value={moneda} onValueChange={(v) => setMoneda(String(v ?? "COP"))} />
                </div>
              ) : null}
              {tipo === "tarjeta_socio" ? (
                <div className="space-y-1">
                  <Label htmlFor="socioCuenta">Socio</Label>
                  <Combobox id="socioCuenta" items={socios.map((s) => ({ value: s.id, label: s.nombre }))} value={socioId} onValueChange={(v) => setSocioId(v ? String(v) : null)} />
                </div>
              ) : null}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-1">
              <Label htmlFor="nombreCuenta">Nombre</Label>
              <Input id="nombreCuenta" value={nombre} maxLength={60} required onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="digitosCuenta">Últimos 4 (opcional)</Label>
              <Input id="digitosCuenta" inputMode="numeric" value={digitos} maxLength={4} onChange={(e) => setDigitos(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="saldoCuenta">
              {tipo === "tarjeta_socio" ? "Lo que la clínica le debía al socio" : "Saldo"} a la fecha de inicio ({moneda})
            </Label>
            <CampoDinero key={moneda} id="saldoCuenta" moneda={moneda as Moneda} valorInicial={saldo} permitirNegativo={tipo === "banco"} onValor={setSaldo} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------ Socios
function Socios({ socios, cuentas, tiposIdentificacion, empleados, puedeEditar, gestion }: Props) {
  const [editando, setEditando] = useState<Socio | "nuevo" | null>(null);
  if (!gestion) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Los socios, sus tarjetas y los préstamos están disponibles en el plan Pro.
        </CardContent>
      </Card>
    );
  }
  const total = socios.filter((s) => s.activo).reduce((t, s) => t + (s.porcentaje_participacion ?? 0), 0);
  const tarjetas = (id: string) => cuentas.filter((c) => c.socio_id === id).length;
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Socios</CardTitle>
          <p className="text-sm text-muted-foreground">
            Quienes pagan gastos con su tarjeta o le prestan plata a la clínica.
            {total > 0 ? ` Participación registrada: ${total.toLocaleString("es-CO")} %.` : ""}
          </p>
        </div>
        {puedeEditar ? (
          <Button size="sm" onClick={() => setEditando("nuevo")}>
            <PlusIcon /> Nuevo socio
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {socios.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay socios.</p> : null}
        <ul className="divide-y">
          {socios.map((s) => (
            <li key={s.id} className={cn("flex flex-wrap items-center gap-3 py-3", !s.activo && "opacity-60")}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {s.nombre} {!s.activo ? <Badge variant="outline">Inactivo</Badge> : null}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {s.numero_identificacion}
                  {s.porcentaje_participacion ? ` · ${s.porcentaje_participacion.toLocaleString("es-CO")} %` : ""}
                  {s.empleado_id ? " · empleado(a)" : ""}
                  {tarjetas(s.id) ? ` · ${tarjetas(s.id)} tarjeta${tarjetas(s.id) === 1 ? "" : "s"}` : ""}
                </span>
              </span>
              {puedeEditar ? (
                <Button variant="outline" size="icon-sm" aria-label={`Editar ${s.nombre}`} onClick={() => setEditando(s)}>
                  <PencilIcon />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
      {editando ? (
        <SocioDialog socio={editando === "nuevo" ? null : editando} tiposIdentificacion={tiposIdentificacion} empleados={empleados} onCerrar={() => setEditando(null)} />
      ) : null}
    </Card>
  );
}

function SocioDialog({ socio, tiposIdentificacion, empleados, onCerrar }: { socio: Socio | null; tiposIdentificacion: Opcion[]; empleados: Opcion[]; onCerrar: () => void }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(socio?.nombre ?? "");
  const [numero, setNumero] = useState(socio?.numero_identificacion ?? "");
  const [tipoId, setTipoId] = useState<string | null>(socio?.tipo_identificacion_id ?? null);
  const [porcentaje, setPorcentaje] = useState(socio?.porcentaje_participacion ? String(socio.porcentaje_participacion).replace(".", ",") : "");
  const [empleadoId, setEmpleadoId] = useState<string | null>(socio?.empleado_id ?? null);
  const [activo, setActivo] = useState(socio?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const pct = porcentaje.trim() ? leerMonto(porcentaje) : null;
    if (porcentaje.trim() && pct === null) return setError("La participación debe ser un número.");
    setPendiente(true);
    setError(null);
    const r = await guardarSocio({ id: socio?.id ?? null, nombre, numeroIdentificacion: numero, tipoIdentificacionId: tipoId, porcentaje: pct, empleadoId, activo });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: socio ? "Socio actualizado" : "Socio creado", type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{socio ? `Editar ${socio.nombre}` : "Nuevo socio"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <MensajeError mensaje={error} />
          <div className="space-y-1">
            <Label htmlFor="nombreSocio">Nombre completo</Label>
            <Input id="nombreSocio" value={nombre} maxLength={200} required onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="tipoIdSocio">Tipo de identificación</Label>
              <Combobox id="tipoIdSocio" items={tiposIdentificacion.map((t) => ({ value: t.id, label: t.nombre }))} value={tipoId} onValueChange={(v) => setTipoId(v ? String(v) : null)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="numeroSocio">Número</Label>
              <Input id="numeroSocio" value={numero} maxLength={20} required onChange={(e) => setNumero(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pctSocio">Participación % (opcional)</Label>
              <Input id="pctSocio" inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="empleadoSocio">Es empleado(a) (opcional)</Label>
              <Combobox
                id="empleadoSocio"
                items={empleados.map((e) => ({ value: e.id, label: e.nombre }))}
                value={empleadoId}
                onValueChange={(v) => setEmpleadoId(v ? String(v) : null)}
                placeholder="Elige su ficha de RRHH"
              />
            </div>
          </div>
          {socio ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={activo} onCheckedChange={(v) => setActivo(!!v)} /> Activo
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------ Categorías
function Categorias({ categorias, puedeEditar }: Props) {
  const [nueva, setNueva] = useState(false);
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Categorías</CardTitle>
          <p className="text-sm text-muted-foreground">
            En qué se gasta y de dónde entra la plata. Puedes renombrarlas, desactivar las que no uses y crear las tuyas. Cada
            una está en una actividad (operación, inversión o financiación), como lo pide el informe de flujo de efectivo.
          </p>
        </div>
        {puedeEditar ? (
          <Button size="sm" onClick={() => setNueva(true)}>
            <PlusIcon /> Nueva categoría
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {(["ingreso", "egreso"] as const).map((tipo) => (
          <section key={tipo} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{tipo === "ingreso" ? "Entradas" : "Salidas"}</h3>
            <ul className="divide-y rounded-lg border">
              {categorias
                .filter((c) => c.tipo === tipo || (tipo === "egreso" && (c.tipo === "transferencia" || c.tipo === "ambos")))
                .map((c) => (
                  <CategoriaFila key={c.codigo} categoria={c} puedeEditar={puedeEditar} />
                ))}
            </ul>
          </section>
        ))}
      </CardContent>
      {nueva ? <CategoriaDialog onCerrar={() => setNueva(false)} /> : null}
    </Card>
  );
}

function CategoriaFila({ categoria: c, puedeEditar }: { categoria: Categoria; puedeEditar: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(c.nombre);
  const [pendiente, setPendiente] = useState(false);

  async function guardar(cambio: { nombre?: string | null; activa?: boolean }) {
    setPendiente(true);
    const nombreFinal = cambio.nombre !== undefined ? cambio.nombre : c.propia || c.nombre !== c.nombre_original ? c.nombre : null;
    const r = await personalizarCategoria({
      codigo: c.codigo,
      personalizacionId: c.personalizacion_id,
      nombre: nombreFinal,
      activa: cambio.activa ?? c.activa,
    });
    setPendiente(false);
    if (r.error) return toast.add({ title: "No se guardó", description: r.error, type: "error" });
    setEditando(false);
    router.refresh();
  }

  return (
    <li className={cn("flex flex-wrap items-center gap-3 p-3", !c.activa && "opacity-60")}>
      <span className="min-w-0 flex-1">
        {editando ? (
          <span className="flex flex-wrap items-center gap-2">
            <Input aria-label={`Nuevo nombre de ${c.nombre}`} value={nombre} maxLength={60} className="h-8 max-w-64" onChange={(e) => setNombre(e.target.value)} />
            <Button size="sm" disabled={pendiente || nombre.trim().length < 3} onClick={() => guardar({ nombre: !c.propia && nombre.trim() === c.nombre_original ? null : nombre.trim() })}>
              Guardar
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
                setEditando(false);
                setNombre(c.nombre);
              }}>
              Cancelar
            </Button>
          </span>
        ) : (
          <span className="block text-sm font-medium">
            {c.nombre}{" "}
            {c.automatica ? <Badge variant="secondary">Automática</Badge> : null} {c.propia ? <Badge variant="outline">Propia</Badge> : null}
          </span>
        )}
        <span className="block text-xs text-muted-foreground">
          {etiqueta(ACTIVIDADES, c.actividad)}
          {!c.propia && c.nombre !== c.nombre_original && c.nombre_original ? ` · antes "${c.nombre_original}"` : ""} · {c.ayuda}
        </span>
      </span>
      {puedeEditar && !c.automatica ? (
        <>
          {!editando ? (
            <Button variant="outline" size="icon-sm" aria-label={`Renombrar ${c.nombre}`} onClick={() => setEditando(true)}>
              <PencilIcon />
            </Button>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={c.activa} disabled={pendiente} aria-label={`${c.activa ? "Desactivar" : "Activar"} ${c.nombre}`} onCheckedChange={(activa) => guardar({ activa })} />
            Activa
          </label>
        </>
      ) : null}
    </li>
  );
}

function CategoriaDialog({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<string>("egreso");
  const [actividad, setActividad] = useState<string>("operacion");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function crear(ev: React.FormEvent) {
    ev.preventDefault();
    setPendiente(true);
    setError(null);
    const r = await crearCategoriaPropia({ nombre, tipo, actividad });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Categoría creada", type: "success" });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva categoría</DialogTitle>
        </DialogHeader>
        <form onSubmit={crear} className="space-y-4">
          <MensajeError mensaje={error} />
          <div className="space-y-1">
            <Label htmlFor="nombreCategoria">Nombre</Label>
            <Input id="nombreCategoria" value={nombre} maxLength={60} required onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="tipoCategoria">Es una</Label>
              <Combobox
                id="tipoCategoria"
                items={[
                  { value: "egreso", label: "Salida de plata" },
                  { value: "ingreso", label: "Entrada de plata" },
                ]}
                value={tipo}
                onValueChange={(v) => setTipo(String(v ?? "egreso"))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="actividadCategoria">Actividad</Label>
              <Combobox id="actividadCategoria" items={ACTIVIDADES.map((a) => ({ value: a.value, label: a.label }))} value={actividad} onValueChange={(v) => setActividad(String(v ?? "operacion"))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{ACTIVIDADES.find((a) => a.value === actividad)?.ayuda}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Creando…" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
