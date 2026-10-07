"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DownloadIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { cerrarActividad, conformarComite, crearActividad, registrarReunion, urlActa } from "@/lib/sst/plan-acciones";
import { subirArchivoSst } from "@/lib/sst/subida-cliente";
import { CICLOS } from "@/lib/sst/documentos-catalogo";
import { etiqueta } from "@/lib/sst/constantes";
import type { ActividadPlan, ComiteSst } from "@/lib/sst/consultas";
import type { IndicadorMes, InsumoMes } from "@/lib/sst/indicadores";
import { ACCEPT_ARCHIVO } from "@/lib/habilitacion/constantes";
import { fechaLegible, hoyColombiaCliente, sumarDias } from "@/lib/habilitacion/ruta";
import { cn } from "cn";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarraProgreso } from "../../habilitacion/autoevaluacion/barra-progreso";
import { abrirFirmado } from "../../habilitacion/_components/abrir-firmado";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const TIPOS_COMITE = [
  { value: "vigia", label: "Vigía de SST" },
  { value: "copasst", label: "COPASST" },
  { value: "convivencia", label: "Comité de Convivencia Laboral" },
];
const ROLES = [
  { value: "principal", label: "Principal" },
  { value: "suplente", label: "Suplente" },
  { value: "presidente", label: "Presidente" },
  { value: "secretario", label: "Secretario" },
  { value: "vigia", label: "Vigía" },
];
const PARTES = [
  { value: "trabajadores", label: "Trabajadores" },
  { value: "empleador", label: "Empleador" },
];
type Usuario = { id: string; nombre: string };

export function PlanCliente(props: {
  hoy: string;
  anio: number;
  plan: ActividadPlan[];
  comites: ComiteSst[];
  usuarios: Usuario[];
  mensuales: IndicadorMes[] | null;
  insumos: InsumoMes[] | null;
  anuales: { accidentes: number; mortalidad: number | null; prevalenciaEl: number | null; incidenciaEl: number | null; promedioTrabajadores: number } | null;
  comiteRequerido: "vigia" | "copasst" | "ninguno";
  convivenciaRequerida: boolean;
  puedeCrear: boolean;
  puedeEditar: boolean;
  tab: string;
}) {
  return (
    <Tabs defaultValue={["plan", "comites", "indicadores"].includes(props.tab) ? props.tab : "plan"}>
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="plan">Plan anual</TabsTrigger>
        <TabsTrigger value="comites">Comités</TabsTrigger>
        <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
      </TabsList>
      <TabsContent value="plan" className="pt-4">
        <Plan {...props} />
      </TabsContent>
      <TabsContent value="comites" className="pt-4">
        <Comites {...props} />
      </TabsContent>
      <TabsContent value="indicadores" className="pt-4">
        <Indicadores {...props} />
      </TabsContent>
    </Tabs>
  );
}

function SelectorAnio({ anio, tab }: { anio: number; tab: string }) {
  return (
    <p className="flex gap-3 text-xs">
      <Link href={`/sst/plan?tab=${tab}&anio=${anio - 1}`} className="text-primary underline-offset-4 hover:underline">← {anio - 1}</Link>
      <Link href={`/sst/plan?tab=${tab}&anio=${anio + 1}`} className="text-primary underline-offset-4 hover:underline">{anio + 1} →</Link>
    </p>
  );
}

// ------------------------------------------------------------ Plan anual
function Plan({ anio, plan, usuarios, puedeCrear, puedeEditar, hoy }: { anio: number; plan: ActividadPlan[]; usuarios: Usuario[]; puedeCrear: boolean; puedeEditar: boolean; hoy: string }) {
  const [nueva, setNueva] = useState(false);
  const vigentes = plan.filter((a) => a.estado !== "cancelada");
  const ejecutadas = vigentes.filter((a) => a.estado === "ejecutada").length;
  const mesActual = anio === Number(hoy.slice(0, 4)) ? Number(hoy.slice(5, 7)) : anio < Number(hoy.slice(0, 4)) ? 12 : 0;
  const vencidas = vigentes.filter((a) => a.estado === "pendiente" && a.mes < mesActual).length;
  const nombres = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold">Plan anual de trabajo {anio}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Actividades con metas, responsables y fechas. El plan firmado se guarda en Documentos.
            {vencidas > 0 ? <span className="text-destructive"> {vencidas} actividad{vencidas === 1 ? "" : "es"} de meses pasados sin ejecutar.</span> : null}
          </p>
          <SelectorAnio anio={anio} tab="plan" />
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:w-56">
          <BarraProgreso valor={vigentes.length ? (ejecutadas / vigentes.length) * 100 : 0} etiqueta={`Cumplimiento: ${ejecutadas} de ${vigentes.length}`} />
          {puedeCrear ? (
            <Button size="sm" onClick={() => setNueva(true)}>
              <PlusIcon /> Agregar actividad
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {plan.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin actividades en {anio}.</p>
        ) : (
          <ul className="divide-y">
            {plan.map((a) => (
              <ActividadItem key={a.id} a={a} responsable={a.responsable_id ? nombres.get(a.responsable_id) : undefined} vencida={a.estado === "pendiente" && a.mes < mesActual} puedeEditar={puedeEditar} />
            ))}
          </ul>
        )}
      </CardContent>
      {nueva ? <ActividadDialog anio={anio} usuarios={usuarios} onCerrar={() => setNueva(false)} /> : null}
    </Card>
  );
}

function ActividadItem({ a, responsable, vencida, puedeEditar }: { a: ActividadPlan; responsable?: string; vencida: boolean; puedeEditar: boolean }) {
  const router = useRouter();
  const [modo, setModo] = useState<"ver" | "ejecutar" | "cancelar">("ver");
  const [fecha, setFecha] = useState(hoyColombiaCliente());
  const [obs, setObs] = useState("");
  async function cerrar(estado: "ejecutada" | "cancelada") {
    const r = await cerrarActividad(a.id, estado, estado === "ejecutada" ? fecha : null, obs);
    if (r.error) return toast.add({ title: "No se actualizó", description: r.error, type: "error" });
    toast.add({ title: estado === "ejecutada" ? "Actividad ejecutada" : "Actividad cancelada", type: "success" });
    setModo("ver");
    router.refresh();
  }
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={cn("text-sm font-medium", a.estado === "cancelada" && "line-through")}>{a.actividad}</p>
          <p className="text-xs text-muted-foreground">
            {MESES[a.mes - 1]} · {etiqueta(CICLOS, a.ciclo)}
            {responsable ? ` · ${responsable}` : ""}
            {a.meta ? ` · meta: ${a.meta}` : ""}
            {a.fecha_ejecucion ? ` · ejecutada el ${fechaLegible(a.fecha_ejecucion)}` : ""}
            {a.estado === "cancelada" && a.observacion ? ` · ${a.observacion}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={a.estado === "ejecutada" ? "secondary" : vencida ? "destructive" : "outline"}>
            {a.estado === "ejecutada" ? "Ejecutada" : a.estado === "cancelada" ? "Cancelada" : vencida ? "Atrasada" : "Pendiente"}
          </Badge>
          {a.estado === "pendiente" && puedeEditar && modo === "ver" ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setModo("ejecutar")}>
                Ejecutada
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setModo("cancelar")}>
                Cancelar
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {modo !== "ver" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {modo === "ejecutar" ? (
            <Input type="date" value={fecha} max={hoyColombiaCliente()} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha de ejecución" className="sm:w-44" />
          ) : null}
          <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder={modo === "cancelar" ? "¿Por qué se cancela? (mínimo 10 caracteres)" : "Observación (opcional)"} aria-label="Observación" />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setModo("ver")}>
              Volver
            </Button>
            <Button size="sm" onClick={() => cerrar(modo === "ejecutar" ? "ejecutada" : "cancelada")} disabled={modo === "cancelar" && obs.trim().length < 10}>
              Guardar
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function ActividadDialog({ anio, usuarios, onCerrar }: { anio: number; usuarios: Usuario[]; onCerrar: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPendiente(true);
    setError(null);
    const r = await crearActividad({
      anio,
      mes: Number(fd.get("mes") ?? 1),
      ciclo: String(fd.get("ciclo") ?? "hacer"),
      actividad: String(fd.get("actividad") ?? ""),
      meta: String(fd.get("meta") ?? ""),
      recursos: String(fd.get("recursos") ?? ""),
      responsableId: String(fd.get("responsable") ?? "") || null,
    });
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Actividad agregada", type: "success" });
    router.refresh();
    onCerrar();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar actividad al plan {anio}</DialogTitle>
          <DialogDescription>Una actividad por cada objetivo del año: capacitaciones, inspecciones, exámenes, simulacros, revisiones.</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="actividadPlan">Actividad</Label>
            <Textarea id="actividadPlan" name="actividad" rows={2} minLength={3} maxLength={500} required />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="mesPlan">Mes</Label>
              <Combobox id="mesPlan" name="mes" items={MESES.map((m, i) => ({ value: String(i + 1), label: m }))} defaultValue={String(Number(hoyColombiaCliente().slice(5, 7)))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cicloPlan">Ciclo</Label>
              <Combobox id="cicloPlan" name="ciclo" items={CICLOS.map((c) => ({ value: c.value, label: c.label }))} defaultValue="hacer" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="responsablePlan">Responsable</Label>
              <Combobox id="responsablePlan" name="responsable" items={usuarios.map((u) => ({ value: u.id, label: u.nombre }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="metaPlan">Meta</Label>
              <Input id="metaPlan" name="meta" maxLength={300} placeholder="Ej.: 100 % del personal" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recursosPlan">Recursos</Label>
              <Input id="recursosPlan" name="recursos" maxLength={300} placeholder="Ej.: asesoría de la ARL" />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Agregar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------ Comités
function Comites({ comites, comiteRequerido, convivenciaRequerida, puedeCrear, hoy }: { comites: ComiteSst[]; comiteRequerido: string; convivenciaRequerida: boolean; puedeCrear: boolean; hoy: string }) {
  const [nuevo, setNuevo] = useState<string | null>(null);
  const requeridos = [
    ...(comiteRequerido === "vigia" ? ["vigia"] : comiteRequerido === "copasst" ? ["copasst"] : []),
    ...(convivenciaRequerida ? ["convivencia"] : []),
  ];
  const vigente = (tipo: string) => comites.find((c) => c.tipo === tipo && c.fecha_inicio <= hoy && c.fecha_fin >= hoy);
  return (
    <div className="space-y-4">
      {requeridos.map((tipo) => {
        const c = vigente(tipo);
        return (
          <Card key={tipo}>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base font-semibold">{etiqueta(TIPOS_COMITE, tipo)}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {c ? `Periodo del ${fechaLegible(c.fecha_inicio)} al ${fechaLegible(c.fecha_fin)}.` : "Sin periodo vigente: confórmalo (elección o designación) por 2 años."}
                </p>
              </div>
              {puedeCrear ? (
                <Button size="sm" variant={c ? "outline" : "default"} className="shrink-0" onClick={() => setNuevo(tipo)}>
                  <PlusIcon /> {c ? "Nuevo periodo" : "Conformar"}
                </Button>
              ) : null}
            </CardHeader>
            {c ? (
              <CardContent className="space-y-3">
                <ul className="flex flex-wrap gap-2 text-sm">
                  {c.integrantes.map((i, k) => (
                    <li key={k} className="rounded-full border px-3 py-1">
                      {i.nombre} <span className="text-xs text-muted-foreground">· {etiqueta(ROLES, i.rol)} · {etiqueta(PARTES, i.representa)}</span>
                    </li>
                  ))}
                </ul>
                {c.acta_nombre_archivo ? (
                  <button type="button" onClick={() => abrirFirmado(() => urlActa("comite", c.id))} className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">
                    <DownloadIcon className="size-3.5" /> Acta de conformación: {c.acta_nombre_archivo}
                  </button>
                ) : null}
                <Reuniones comite={c} puedeCrear={puedeCrear} />
              </CardContent>
            ) : null}
          </Card>
        );
      })}
      {requeridos.length === 0 ? <p className="text-sm text-muted-foreground">Con tu diagnóstico actual no te aplica un comité.</p> : null}
      {nuevo ? <ComiteDialog tipo={nuevo} onCerrar={() => setNuevo(null)} /> : null}
    </div>
  );
}

function Reuniones({ comite, puedeCrear }: { comite: ComiteSst; puedeCrear: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const ultima = comite.sst_comite_reuniones[0];
  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const id = crypto.randomUUID();
    setPendiente(true);
    setError(null);
    try {
      let actaPath: string | null = null;
      let actaNombre: string | null = null;
      const archivo = fd.get("actaReunion");
      if (archivo instanceof File && archivo.size > 0) {
        const s = await subirArchivoSst(archivo, "actas", id);
        if ("error" in s) return setError(s.error);
        actaPath = s.path;
        actaNombre = s.nombre;
      }
      const r = await registrarReunion({
        id,
        comiteId: comite.id,
        fecha: String(fd.get("fechaReunion") ?? ""),
        temas: String(fd.get("temas") ?? ""),
        compromisos: String(fd.get("compromisos") ?? ""),
        actaPath,
        actaNombre,
      });
      if (r.error) return setError(r.error);
      toast.add({ title: "Reunión registrada", type: "success" });
      setAbierto(false);
      router.refresh();
    } finally {
      setPendiente(false);
    }
  }
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Reuniones ({comite.sst_comite_reuniones.length}){ultima ? <span className="font-normal text-muted-foreground"> · última el {fechaLegible(ultima.fecha)}</span> : null}
        </p>
        {puedeCrear && !abierto ? (
          <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
            Registrar reunión
          </Button>
        ) : null}
      </div>
      {abierto ? (
        <form onSubmit={guardar} className="space-y-3 rounded-lg border p-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
            <div className="space-y-1">
              <Label htmlFor={`fechaReunion-${comite.id}`}>Fecha</Label>
              <Input id={`fechaReunion-${comite.id}`} name="fechaReunion" type="date" defaultValue={hoyColombiaCliente()} max={hoyColombiaCliente()} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`temas-${comite.id}`}>Temas tratados</Label>
              <Textarea id={`temas-${comite.id}`} name="temas" rows={2} minLength={3} maxLength={4000} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`compromisos-${comite.id}`}>Compromisos</Label>
            <Textarea id={`compromisos-${comite.id}`} name="compromisos" rows={2} maxLength={4000} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`actaReunion-${comite.id}`}>Acta (opcional)</Label>
            <FileInput id={`actaReunion-${comite.id}`} name="actaReunion" accept={ACCEPT_ARCHIVO} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Registrar"}
            </Button>
          </div>
        </form>
      ) : null}
      <ul className="space-y-1 text-sm">
        {comite.sst_comite_reuniones.slice(0, 6).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-2">
            <span className="text-muted-foreground">{fechaLegible(r.fecha)}</span>
            <span className="min-w-0 truncate">{r.temas}</span>
            {r.acta_nombre_archivo ? (
              <button type="button" onClick={() => abrirFirmado(() => urlActa("reunion", r.id))} className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">
                <DownloadIcon className="size-3.5" /> acta
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComiteDialog({ tipo, onCerrar }: { tipo: string; onCerrar: () => void }) {
  const router = useRouter();
  const hoy = hoyColombiaCliente();
  const [id] = useState(() => crypto.randomUUID());
  const [inicio, setInicio] = useState(hoy);
  const [integrantes, setIntegrantes] = useState(
    tipo === "vigia" ? [{ nombre: "", representa: "trabajadores", rol: "vigia" }] : [
      { nombre: "", representa: "empleador", rol: "principal" },
      { nombre: "", representa: "trabajadores", rol: "principal" },
    ],
  );
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPendiente(true);
    setError(null);
    try {
      let actaPath: string | null = null;
      let actaNombre: string | null = null;
      const archivo = fd.get("actaComite");
      if (archivo instanceof File && archivo.size > 0) {
        const s = await subirArchivoSst(archivo, "actas", id);
        if ("error" in s) return setError(s.error);
        actaPath = s.path;
        actaNombre = s.nombre;
      }
      const r = await conformarComite({ id, tipo, fechaInicio: inicio, fechaFin: String(fd.get("fechaFin") ?? ""), integrantes, actaPath, actaNombre });
      if (r.error) return setError(r.error);
      toast.add({ title: "Comité conformado", type: "success" });
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
          <DialogTitle>{etiqueta(TIPOS_COMITE, tipo)}: nuevo periodo</DialogTitle>
          <DialogDescription>El periodo es de 2 años. El anterior queda en el historial.</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="inicioComite">Inicio</Label>
              <Input id="inicioComite" type="date" value={inicio} max={hoy} onChange={(e) => setInicio(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="finComite">Fin</Label>
              <Input key={inicio} id="finComite" name="fechaFin" type="date" defaultValue={sumarDias(inicio, 730)} min={inicio} required />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Integrantes</legend>
            {integrantes.map((x, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_9rem_auto]">
                <Input aria-label={`Integrante ${i + 1}`} value={x.nombre} maxLength={200} placeholder="Nombre" onChange={(e) => setIntegrantes(integrantes.map((y, j) => (j === i ? { ...y, nombre: e.target.value } : y)))} />
                <Combobox aria-label={`Representa ${i + 1}`} items={PARTES} value={x.representa} onValueChange={(v) => setIntegrantes(integrantes.map((y, j) => (j === i ? { ...y, representa: v ?? "trabajadores" } : y)))} />
                <Combobox aria-label={`Rol ${i + 1}`} items={ROLES} value={x.rol} onValueChange={(v) => setIntegrantes(integrantes.map((y, j) => (j === i ? { ...y, rol: v ?? "principal" } : y)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar" onClick={() => setIntegrantes(integrantes.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setIntegrantes([...integrantes, { nombre: "", representa: "trabajadores", rol: "suplente" }])}>
              <PlusIcon /> Otro integrante
            </Button>
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="actaComite">Acta de conformación (opcional)</Label>
            <FileInput id="actaComite" name="actaComite" accept={ACCEPT_ARCHIVO} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------ Indicadores
const fmt = (n: number | null, d = 2) => (n === null ? "—" : new Intl.NumberFormat("es-CO", { maximumFractionDigits: d }).format(n));

function Indicadores({ anio, mensuales, insumos, anuales }: { anio: number; mensuales: IndicadorMes[] | null; insumos: InsumoMes[] | null; anuales: { accidentes: number; mortalidad: number | null; prevalenciaEl: number | null; incidenciaEl: number | null; promedioTrabajadores: number } | null }) {
  if (!mensuales || !insumos || !anuales) {
    return (
      <Alert>
        <AlertDescription>Los indicadores se están terminando de instalar en tu cuenta.</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Indicadores {anio} (Res. 0312, Art. 30)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Calculados con los eventos e incapacidades registrados. Trabajadores del mes: personal vigente según su contrato en RRHH; días
            programados: trabajadores × días hábiles (lunes a viernes sin festivos).
          </p>
          <SelectorAnio anio={anio} tab="indicadores" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra titulo="Accidentes de trabajo" valor={fmt(anuales.accidentes, 0)} detalle={`Promedio de ${fmt(anuales.promedioTrabajadores, 1)} trabajadores`} />
            <Cifra titulo="AT mortales" valor={anuales.mortalidad === null ? "—" : `${fmt(anuales.mortalidad)} %`} detalle="Proporción del año" />
            <Cifra titulo="Incidencia de EL" valor={fmt(anuales.incidenciaEl, 0)} detalle="Casos nuevos × 100.000" />
            <Cifra titulo="Prevalencia de EL" valor={fmt(anuales.prevalenciaEl, 0)} detalle="Casos totales × 100.000" />
          </div>
          {mensuales.length === 0 ? (
            <p className="text-sm text-muted-foreground">El año aún no empieza.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Mes</th>
                    <th className="py-2 pr-3 font-medium">Trabajadores</th>
                    <th className="py-2 pr-3 font-medium">AT</th>
                    <th className="py-2 pr-3 font-medium">Frecuencia</th>
                    <th className="py-2 pr-3 font-medium">Severidad</th>
                    <th className="py-2 font-medium">Ausentismo</th>
                  </tr>
                </thead>
                <tbody>
                  {mensuales.map((m, i) => (
                    <tr key={m.mes} className="border-b last:border-0">
                      <td className="py-2 pr-3">{MESES[m.mes - 1]}</td>
                      <td className="py-2 pr-3">{insumos[i]?.trabajadores ?? "—"}</td>
                      <td className="py-2 pr-3">{insumos[i]?.accidentes ?? 0}</td>
                      <td className="py-2 pr-3">{fmt(m.frecuencia)}</td>
                      <td className="py-2 pr-3">{fmt(m.severidad)}</td>
                      <td className="py-2">{m.ausentismo === null ? "—" : `${fmt(m.ausentismo)} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Frecuencia = AT ÷ trabajadores × 100 · Severidad = (días de incapacidad por AT + días cargados) ÷ trabajadores × 100 · Ausentismo = días de
            incapacidad ÷ días programados × 100.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-xl font-semibold">{valor}</p>
      <p className="text-xs text-muted-foreground">{detalle}</p>
    </div>
  );
}
