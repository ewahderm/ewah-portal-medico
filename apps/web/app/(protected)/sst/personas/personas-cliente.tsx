"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DownloadIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { anularEntregaEpp, cancelarCapacitacion, guardarCapacitacion, guardarPeriodicidad, registrarEntregaEpp, urlSoportePersonas } from "@/lib/sst/personas-acciones";
import { subirArchivoSst } from "@/lib/sst/subida-cliente";
import { EPP_SALUD, TIPOS_CAPACITACION, estadoExamen } from "@/lib/sst/personas";
import { etiqueta } from "@/lib/sst/constantes";
import type { CapacitacionSst, EntregaEpp, EstadoPersona } from "@/lib/sst/consultas";
import { ACCEPT_ARCHIVO } from "@/lib/habilitacion/constantes";
import { fechaLegible, hoyColombiaCliente } from "@/lib/habilitacion/ruta";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SemaforoBadge } from "../../habilitacion/_components/semaforo-badge";
import { abrirFirmado } from "../../habilitacion/_components/abrir-firmado";

type Persona = { id: string; nombre: string };

export function PersonasCliente(props: {
  hoy: string;
  anio: number;
  estado: EstadoPersona[];
  capacitaciones: CapacitacionSst[];
  entregas: EntregaEpp[];
  personas: Persona[];
  profesiograma: { cargos: { id: string; nombre: string }[]; periodicidad: Record<string, number> };
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeAnular: boolean;
  tab: string;
}) {
  return (
    <Tabs defaultValue={["personas", "capacitacion", "epp"].includes(props.tab) ? props.tab : "personas"}>
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="personas">Personas</TabsTrigger>
        <TabsTrigger value="capacitacion">Capacitación</TabsTrigger>
        <TabsTrigger value="epp">EPP</TabsTrigger>
      </TabsList>
      <TabsContent value="personas" className="space-y-4 pt-4">
        <EstadoPersonas {...props} />
        <Profesiograma {...props} />
      </TabsContent>
      <TabsContent value="capacitacion" className="pt-4">
        <Capacitaciones {...props} />
      </TabsContent>
      <TabsContent value="epp" className="pt-4">
        <Epp {...props} />
      </TabsContent>
    </Tabs>
  );
}

function EstadoPersonas({ estado, hoy }: { estado: EstadoPersona[]; hoy: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Tu personal</CardTitle>
        <p className="text-sm text-muted-foreground">
          Los soportes de exámenes y vacunas se cargan en RRHH; aquí ves si están al día. El concepto médico no se muestra: solo las fechas.
        </p>
      </CardHeader>
      <CardContent>
        {estado.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay personal activo en RRHH.</p>
        ) : (
          <ul className="divide-y">
            {estado.map((p) => {
              const ex = estadoExamen(p, hoy);
              return (
                <li key={p.empleado_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.cargo_nombre ?? "Sin cargo"} · último examen {p.ultimo_examen ? `${fechaLegible(p.ultimo_examen)} (${p.ultimo_examen_tipo === "INGRESO" ? "ingreso" : "periódico"})` : "—"}
                      {p.proximo_examen ? ` · próximo ${fechaLegible(p.proximo_examen)}` : ""} · EPP{" "}
                      {p.ultima_entrega_epp ? fechaLegible(p.ultima_entrega_epp) : "sin entregas"} · {p.capacitaciones_anio} capacitación
                      {p.capacitaciones_anio === 1 ? "" : "es"} este año
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <SemaforoBadge semaforo={ex.semaforo} etiqueta={ex.texto} />
                    {p.vacunas_vencidas > 0 ? (
                      <SemaforoBadge semaforo="rojo" etiqueta={`${p.vacunas_vencidas} vacuna${p.vacunas_vencidas === 1 ? "" : "s"} vencida${p.vacunas_vencidas === 1 ? "" : "s"}`} />
                    ) : p.vacunas_por_vencer > 0 ? (
                      <SemaforoBadge semaforo="ambar" etiqueta="Vacuna por vencer" />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Profesiograma({ profesiograma, puedeEditar }: { profesiograma: { cargos: { id: string; nombre: string }[]; periodicidad: Record<string, number> }; puedeEditar: boolean }) {
  const router = useRouter();
  async function guardar(cargoId: string, valor: string) {
    const meses = valor ? Number(valor) : null;
    const r = await guardarPeriodicidad(cargoId, meses);
    if (r.error) return toast.add({ title: "No se guardó", description: r.error, type: "error" });
    toast.add({ title: "Periodicidad guardada", type: "success" });
    router.refresh();
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Evaluación médica periódica por cargo</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cada cuántos meses se repite según los peligros del cargo (la Res. 1843 de 2025 fija como máximo 3 años). Lo define tu médico laboral.
        </p>
      </CardHeader>
      <CardContent>
        {profesiograma.cargos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Crea los cargos en Parámetros y asígnalos al personal en RRHH.</p>
        ) : (
          <ul className="divide-y">
            {profesiograma.cargos.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{c.nombre}</span>
                <span className="flex items-center gap-2">
                  <Input
                    // Remonta con el valor guardado (Base UI no admite cambiar
                    // el defaultValue de un campo no controlado).
                    key={`${c.id}-${profesiograma.periodicidad[c.id] ?? ""}`}
                    aria-label={`Meses para ${c.nombre}`}
                    type="number"
                    min={1}
                    max={36}
                    defaultValue={profesiograma.periodicidad[c.id] ?? ""}
                    className="w-20"
                    disabled={!puedeEditar}
                    onBlur={(e) => {
                      const v = e.currentTarget.value;
                      if (v && Number(v) !== profesiograma.periodicidad[c.id]) void guardar(c.id, v);
                    }}
                  />
                  <span className="text-muted-foreground">meses</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Capacitaciones({ capacitaciones, personas, anio, puedeCrear, puedeEditar }: { capacitaciones: CapacitacionSst[]; personas: Persona[]; anio: number; puedeCrear: boolean; puedeEditar: boolean }) {
  const [editando, setEditando] = useState<CapacitacionSst | "nueva" | null>(null);
  const realizadas = capacitaciones.filter((c) => c.estado === "realizada").length;
  const programadas = capacitaciones.filter((c) => c.estado !== "cancelada").length;
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Programa de capacitación {anio}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {realizadas} de {programadas} realizadas. Incluye la inducción de cada persona nueva y los temas de tus peligros prioritarios.
          </p>
          <p className="mt-1 flex gap-3 text-xs">
            <Link href={`/sst/personas?tab=capacitacion&anio=${anio - 1}`} className="text-primary underline-offset-4 hover:underline">← {anio - 1}</Link>
            <Link href={`/sst/personas?tab=capacitacion&anio=${anio + 1}`} className="text-primary underline-offset-4 hover:underline">{anio + 1} →</Link>
          </p>
        </div>
        {puedeCrear ? (
          <Button size="sm" className="shrink-0" onClick={() => setEditando("nueva")}>
            <PlusIcon /> Programar o registrar
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {capacitaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin capacitaciones en {anio}.</p>
        ) : (
          <ul className="divide-y">
            {capacitaciones.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className={c.estado === "cancelada" ? "font-medium line-through" : "font-medium"}>{c.tema}</p>
                  <p className="text-xs text-muted-foreground">
                    {etiqueta(TIPOS_CAPACITACION, c.tipo)} · {fechaLegible(c.fecha)}
                    {c.duracion_horas ? ` · ${c.duracion_horas} h` : ""} · {c.sst_capacitacion_asistentes.length} asistente
                    {c.sst_capacitacion_asistentes.length === 1 ? "" : "s"}
                    {c.motivo_cancelacion ? ` · ${c.motivo_cancelacion}` : ""}
                  </p>
                  {c.soporte_nombre_archivo ? (
                    <button type="button" onClick={() => abrirFirmado(() => urlSoportePersonas("capacitacion", c.id))} className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">
                      <DownloadIcon className="size-3.5" /> {c.soporte_nombre_archivo}
                    </button>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={c.estado === "realizada" ? "secondary" : "outline"}>
                    {c.estado === "realizada" ? "Realizada" : c.estado === "cancelada" ? "Cancelada" : "Programada"}
                  </Badge>
                  {c.estado === "programada" && puedeEditar ? (
                    <Button size="sm" variant="outline" onClick={() => setEditando(c)}>
                      Registrar
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editando ? (
        <CapacitacionDialog capacitacion={editando === "nueva" ? null : editando} personas={personas} onCerrar={() => setEditando(null)} />
      ) : null}
    </Card>
  );
}

function CapacitacionDialog({ capacitacion: c, personas, onCerrar }: { capacitacion: CapacitacionSst | null; personas: Persona[]; onCerrar: () => void }) {
  const router = useRouter();
  const hoy = hoyColombiaCliente();
  const [id] = useState(() => c?.id ?? crypto.randomUUID());
  const [fecha, setFecha] = useState(c?.fecha ?? hoy);
  const [realizada, setRealizada] = useState(!!c);
  const [asistentes, setAsistentes] = useState<Set<string>>(new Set(c?.sst_capacitacion_asistentes.map((a) => a.empleado_id) ?? []));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPendiente(true);
    setError(null);
    try {
      let soportePath: string | null = null;
      let soporteNombre: string | null = null;
      const archivo = fd.get("soporte");
      if (archivo instanceof File && archivo.size > 0) {
        const s = await subirArchivoSst(archivo, "personas", id);
        if ("error" in s) return setError(s.error);
        soportePath = s.path;
        soporteNombre = s.nombre;
      }
      const duracion = String(fd.get("duracion") ?? "").trim();
      const r = await guardarCapacitacion({
        id,
        tema: String(fd.get("tema") ?? ""),
        tipo: String(fd.get("tipo") ?? "capacitacion"),
        fecha,
        duracionHoras: duracion ? Number(duracion) : null,
        facilitador: String(fd.get("facilitador") ?? ""),
        modalidad: String(fd.get("modalidad") ?? "presencial"),
        realizada,
        asistentes: [...asistentes],
        soportePath,
        soporteNombre,
      });
      if (r.error) return setError(r.error);
      toast.add({ title: realizada ? "Capacitación registrada" : "Capacitación programada", type: "success" });
      router.refresh();
      onCerrar();
    } finally {
      setPendiente(false);
    }
  }

  async function cancelar() {
    if (!c) return;
    setPendiente(true);
    const r = await cancelarCapacitacion(c.id, motivo);
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Capacitación cancelada", type: "success" });
    router.refresh();
    onCerrar();
  }

  const futura = fecha > hoy;
  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{c ? "Registrar la capacitación" : "Programar o registrar una capacitación"}</DialogTitle>
          <DialogDescription>La lista de asistencia firmada es el soporte que se conserva.</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="tema">Tema</Label>
            <Input id="tema" name="tema" defaultValue={c?.tema ?? ""} minLength={3} maxLength={300} required readOnly={!!c} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="tipoCap">Tipo</Label>
              <Combobox id="tipoCap" name="tipo" items={TIPOS_CAPACITACION.map((t) => ({ value: t.value, label: t.label }))} defaultValue={c?.tipo ?? "capacitacion"} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fechaCap">Fecha</Label>
              <Input id="fechaCap" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="duracion">Duración (horas)</Label>
              <Input id="duracion" name="duracion" type="number" step="0.5" min={0.5} max={200} defaultValue={c?.duracion_horas ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="facilitador">Quién la dicta</Label>
              <Input id="facilitador" name="facilitador" maxLength={200} defaultValue={c?.facilitador ?? ""} placeholder="Ej.: asesor de la ARL" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="modalidad">Modalidad</Label>
              <Combobox
                id="modalidad"
                name="modalidad"
                items={[
                  { value: "presencial", label: "Presencial" },
                  { value: "virtual", label: "Virtual" },
                ]}
                defaultValue={c?.modalidad ?? "presencial"}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={realizada && !futura} disabled={futura} onCheckedChange={(v) => setRealizada(!!v)} /> Ya se realizó
            {futura ? <span className="font-normal text-muted-foreground">(es futura: queda programada)</span> : null}
          </label>
          {realizada && !futura ? (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Asistentes</legend>
                <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                  {personas.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={asistentes.has(p.id)}
                        onCheckedChange={(v) => {
                          const s = new Set(asistentes);
                          if (v) s.add(p.id);
                          else s.delete(p.id);
                          setAsistentes(s);
                        }}
                      />
                      {p.nombre}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-1">
                <Label htmlFor="soporte">Lista de asistencia (opcional)</Label>
                <FileInput id="soporte" name="soporte" accept={ACCEPT_ARCHIVO} />
              </div>
            </>
          ) : null}
          {c ? (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-2 sm:flex-row">
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Si no se hará, ¿por qué? (mínimo 10 caracteres)" aria-label="Motivo de cancelación" />
              <Button type="button" variant="ghost" onClick={cancelar} disabled={pendiente || motivo.trim().length < 10}>
                Cancelar capacitación
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Volver
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : realizada && !futura ? "Guardar como realizada" : "Programar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Epp({ entregas, personas, puedeCrear, puedeAnular }: { entregas: EntregaEpp[]; personas: Persona[]; puedeCrear: boolean; puedeAnular: boolean }) {
  const [nueva, setNueva] = useState(false);
  const nombres = new Map(personas.map((p) => [p.id, p.nombre]));
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Entregas de EPP</CardTitle>
          <p className="text-sm text-muted-foreground">Qué se entregó, a quién y si se le enseñó a usarlo. Se conservan 20 años.</p>
        </div>
        {puedeCrear ? (
          <Button size="sm" className="shrink-0" onClick={() => setNueva(true)}>
            <PlusIcon /> Registrar entrega
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {entregas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin entregas registradas.</p>
        ) : (
          <ul className="divide-y">
            {entregas.map((e) => (
              <EntregaItem key={e.id} entrega={e} nombre={nombres.get(e.empleado_id) ?? "Persona retirada"} puedeAnular={puedeAnular} />
            ))}
          </ul>
        )}
      </CardContent>
      {nueva ? <EntregaDialog personas={personas} onCerrar={() => setNueva(false)} /> : null}
    </Card>
  );
}

function EntregaItem({ entrega: e, nombre, puedeAnular }: { entrega: EntregaEpp; nombre: string; puedeAnular: boolean }) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  async function anular() {
    const r = await anularEntregaEpp(e.id, motivo);
    if (r.error) return toast.add({ title: "No se anuló", description: r.error, type: "error" });
    router.refresh();
  }
  return (
    <li className={e.anulado ? "py-3 opacity-60" : "py-3"}>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{nombre}</span>
        <span className="text-muted-foreground">{fechaLegible(e.fecha)}</span>
        {e.capacitado_uso ? <Badge variant="outline">Capacitado en su uso</Badge> : null}
        {e.anulado ? <Badge variant="secondary">Anulada</Badge> : null}
      </p>
      <p className="text-sm">{e.elementos.map((x) => `${x.cantidad} × ${x.elemento}`).join(", ")}</p>
      {e.anulado_motivo ? <p className="text-xs text-muted-foreground">Anulada: {e.anulado_motivo}</p> : null}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        {e.soporte_nombre_archivo ? (
          <button type="button" onClick={() => abrirFirmado(() => urlSoportePersonas("epp", e.id))} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
            <DownloadIcon className="size-3.5" /> {e.soporte_nombre_archivo}
          </button>
        ) : null}
        {puedeAnular && !e.anulado && !anulando ? (
          <button type="button" className="text-muted-foreground underline underline-offset-4" onClick={() => setAnulando(true)}>
            Anular
          </button>
        ) : null}
      </div>
      {anulando ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={motivo} onChange={(x) => setMotivo(x.target.value)} placeholder="Motivo (mínimo 10 caracteres)" aria-label="Motivo de anulación" />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAnulando(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" disabled={motivo.trim().length < 10} onClick={anular}>
              Anular
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function EntregaDialog({ personas, onCerrar }: { personas: Persona[]; onCerrar: () => void }) {
  const router = useRouter();
  const hoy = hoyColombiaCliente();
  const [id] = useState(() => crypto.randomUUID());
  const [elementos, setElementos] = useState<{ elemento: string; cantidad: number }[]>([{ elemento: "Guantes de nitrilo", cantidad: 1 }]);
  const [capacitado, setCapacitado] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function guardar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    setPendiente(true);
    setError(null);
    try {
      let soportePath: string | null = null;
      let soporteNombre: string | null = null;
      const archivo = fd.get("soporteEpp");
      if (archivo instanceof File && archivo.size > 0) {
        const s = await subirArchivoSst(archivo, "personas", id);
        if ("error" in s) return setError(s.error);
        soportePath = s.path;
        soporteNombre = s.nombre;
      }
      const r = await registrarEntregaEpp({
        id,
        empleadoId: String(fd.get("empleadoEpp") ?? ""),
        fecha: String(fd.get("fechaEpp") ?? ""),
        elementos,
        capacitadoUso: capacitado,
        observacion: String(fd.get("observacionEpp") ?? ""),
        soportePath,
        soporteNombre,
      });
      if (r.error) return setError(r.error);
      toast.add({ title: "Entrega registrada", type: "success" });
      router.refresh();
      onCerrar();
    } finally {
      setPendiente(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar entrega de EPP</DialogTitle>
          <DialogDescription>Adjunta el formato firmado por quien recibe, si lo tienes.</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="empleadoEpp">Persona</Label>
              <Combobox id="empleadoEpp" name="empleadoEpp" items={personas.map((p) => ({ value: p.id, label: p.nombre }))} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fechaEpp">Fecha</Label>
              <Input id="fechaEpp" name="fechaEpp" type="date" defaultValue={hoy} max={hoy} required />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Elementos</legend>
            <datalist id="epp-salud">
              {EPP_SALUD.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            {elementos.map((x, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2">
                <Input
                  aria-label={`Elemento ${i + 1}`}
                  list="epp-salud"
                  value={x.elemento}
                  maxLength={120}
                  onChange={(e) => setElementos(elementos.map((y, j) => (j === i ? { ...y, elemento: e.target.value } : y)))}
                />
                <Input
                  aria-label={`Cantidad ${i + 1}`}
                  type="number"
                  min={1}
                  value={x.cantidad}
                  onChange={(e) => setElementos(elementos.map((y, j) => (j === i ? { ...y, cantidad: Number(e.target.value) || 1 } : y)))}
                />
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar" onClick={() => setElementos(elementos.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setElementos([...elementos, { elemento: "", cantidad: 1 }])}>
              <PlusIcon /> Otro elemento
            </Button>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={capacitado} onCheckedChange={(v) => setCapacitado(!!v)} /> Se le explicó cómo usarlo, cuidarlo y cuándo reponerlo
          </label>
          <div className="space-y-1">
            <Label htmlFor="observacionEpp">Observación (opcional)</Label>
            <Input id="observacionEpp" name="observacionEpp" maxLength={1000} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="soporteEpp">Formato firmado (opcional)</Label>
            <FileInput id="soporteEpp" name="soporteEpp" accept={ACCEPT_ARCHIVO} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente || personas.length === 0}>
              {pendiente ? "Guardando…" : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
