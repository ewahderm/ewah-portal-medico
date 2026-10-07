"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InfoIcon, ListChecksIcon, LoaderCircleIcon } from "lucide-react";
import {
  declararServicioSede,
  guardarDetalleServicio,
  previsualizarCriterios,
} from "@/lib/habilitacion/sedes-servicios";
import {
  COMPLEJIDADES,
  ESTADOS_SERVICIO,
  MODALIDADES,
  TELEMEDICINA_CATEGORIAS,
  TELEMEDICINA_ROLES,
  etiquetaDe,
} from "@/lib/habilitacion/constantes";
import type {
  DetalleServicioInput,
  PracticaConNumerales,
  PreviewCriterios,
  ServicioSede,
} from "@/lib/habilitacion/tipos";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChipsMultiples, TarjetasRadio } from "../_components/opciones-tarjeta";

const fmt = (n: number) => new Intl.NumberFormat("es-CO").format(n);

// HU-2.2: declarar (o configurar) un servicio en una sede. El formulario
// solo OFRECE lo que la norma prevé para el numeral elegido (complejidades,
// modalidades, categorías de telemedicina); el trigger de 0062 lo vuelve a
// validar en BD. Mientras se llena, el preview llama al motor SQL (0065)
// con y sin el servicio: "Este servicio te agrega N criterios".
export function ServicioSedeDialog({
  sede,
  practicas,
  servicio,
  practicasEnSede = [],
  trigger,
}: {
  sede: { id: string; nombre: string };
  practicas: PracticaConNumerales[];
  servicio?: ServicioSede;
  practicasEnSede?: string[];
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const editando = !!servicio;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [practicaId, setPracticaId] = useState<string | null>(servicio?.practica_medica_id ?? null);
  const [numeralId, setNumeralId] = useState<string | null>(servicio?.servicio_norma_id ?? null);
  const [complejidad, setComplejidad] = useState<string | null>(servicio?.complejidad ?? null);
  const [modalidades, setModalidades] = useState<string[]>(servicio?.modalidades ?? []);
  const [categorias, setCategorias] = useState<string[]>(servicio?.telemedicina_categorias ?? []);
  const [roles, setRoles] = useState<string[]>(servicio?.telemedicina_roles ?? []);
  const [estado, setEstado] = useState<string>(servicio?.estado ?? "por_habilitar");
  const [fechaHabilitacion, setFechaHabilitacion] = useState(servicio?.fecha_habilitacion ?? "");
  const [fechaCierre, setFechaCierre] = useState(servicio?.fecha_cierre_temporal ?? "");
  const [codigo, setCodigo] = useState("");

  const practica = practicas.find((p) => p.id === practicaId) ?? null;
  const opciones = practica?.opciones ?? [];
  const requiereEleccion = opciones.length > 1;
  // Con una sola opción el numeral es ese (el trigger lo asignaría igual).
  const numeral = opciones.length === 1 ? opciones[0] : (opciones.find((o) => o.id === numeralId) ?? null);

  // Práctica elegible para declarar: no está ya en la sede, salvo las de
  // varios numerales (Obstetricia puede ir con 11.4.1 y con 11.6.4).
  const itemsPracticas = useMemo(
    () =>
      practicas
        .filter((p) => !practicasEnSede.includes(p.id) || p.opciones.length > 1)
        .map((p) => ({ value: p.id, label: p.grupo ? `${p.nombre} · ${p.grupo}` : p.nombre })),
    [practicas, practicasEnSede],
  );

  function elegirPractica(id: string | null) {
    setPracticaId(id);
    setNumeralId(null);
    const p = practicas.find((x) => x.id === id);
    aplicarNumeral(p?.opciones.length === 1 ? p.opciones[0] : null);
  }

  // Al cambiar de numeral se descarta lo que el nuevo no admite.
  function aplicarNumeral(o: PracticaConNumerales["opciones"][number] | null) {
    setComplejidad((c) => (o ? (o.complejidades.length === 1 ? o.complejidades[0] : c && o.complejidades.includes(c) ? c : null) : null));
    setModalidades((m) => (o ? m.filter((x) => o.modalidades.includes(x)) : []));
    setCategorias((c) => (o ? c.filter((x) => o.telemedicina_categorias.includes(x)) : []));
  }

  const conTelemedicina = modalidades.includes("telemedicina");
  const detalle: DetalleServicioInput = useMemo(
    () => ({
      servicioNormaId: numeral?.id ?? null,
      complejidad: numeral && numeral.complejidades.length === 1 ? numeral.complejidades[0] : complejidad,
      modalidades,
      telemedicinaCategorias: conTelemedicina ? categorias : [],
      telemedicinaRoles: conTelemedicina ? roles : [],
    }),
    [numeral, complejidad, modalidades, categorias, roles, conTelemedicina],
  );

  // ---- Preview (debounce 400 ms; descarta respuestas viejas) ----
  const [preview, setPreview] = useState<PreviewCriterios | null>(null);
  const [calculando, setCalculando] = useState(false);
  const turno = useRef(0);
  const listoParaMotor = open && !!detalle.servicioNormaId && !!detalle.complejidad && detalle.modalidades.length > 0;
  const claveDetalle = JSON.stringify(detalle);

  useEffect(() => {
    if (!listoParaMotor) return;
    const mio = ++turno.current;
    const t = setTimeout(async () => {
      setCalculando(true);
      const r = await previsualizarCriterios({ sedeId: sede.id, servicioId: servicio?.id ?? null, detalle: JSON.parse(claveDetalle) });
      if (mio === turno.current) {
        setPreview(r);
        setCalculando(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [listoParaMotor, claveDetalle, sede.id, servicio?.id]);

  function guardar() {
    setError(null);
    if (!practicaId) return setError("Elige el servicio que prestas.");
    if (requiereEleccion && !numeral) return setError("Este servicio corresponde a varios numerales de la norma: elige cuál prestas.");
    if (numeral && !detalle.complejidad) return setError("Elige la complejidad.");
    if (numeral && modalidades.length === 0) return setError("Marca al menos una modalidad.");

    const comun = {
      ...detalle,
      estado,
      fechaHabilitacion: fechaHabilitacion || null,
      fechaCierreTemporal: fechaCierre || null,
    };
    startTransition(async () => {
      const r = servicio
        ? await guardarDetalleServicio({ ...comun, id: servicio.id })
        : await declararServicioSede({ ...comun, sedeId: sede.id, practicaMedicaId: practicaId, codigoHabilitacion: codigo || null });
      if (r.error) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
      toast.add({
        title: servicio ? "Servicio actualizado" : "Servicio declarado",
        description:
          preview?.agrega !== null && preview?.agrega !== undefined
            ? `${sede.nombre}: ${fmt(preview.totalSede ?? 0)} criterios aplicables.`
            : undefined,
        type: "success",
      });
    });
  }

  function alAbrir(abierto: boolean) {
    setOpen(abierto);
    if (abierto) {
      setError(null);
      setPreview(null);
      // Declarar: cada apertura empieza en blanco (no arrastra el servicio
      // recién declarado). Configurar: conserva lo guardado.
      if (!editando) {
        setPracticaId(null);
        setNumeralId(null);
        setComplejidad(null);
        setModalidades([]);
        setCategorias([]);
        setRoles([]);
        setEstado("por_habilitar");
        setFechaHabilitacion("");
        setFechaCierre("");
        setCodigo("");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={alAbrir}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? `Configurar ${servicio.practicas_medicas?.nombre ?? "servicio"}` : "Declarar un servicio"}</DialogTitle>
          <p className="text-sm text-muted-foreground">Sede: {sede.nombre}</p>
        </DialogHeader>

        <div className="space-y-5">
          {!editando ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label htmlFor="practica">¿Qué servicio prestas?</Label>
                <Combobox
                  id="practica"
                  items={itemsPracticas}
                  value={practicaId}
                  onValueChange={(v) => elegirPractica(v ?? null)}
                  placeholder="Escribe para buscar: consulta, cirugía…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigoServicio">Código de habilitación (opcional)</Label>
                <Input id="codigoServicio" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={50} />
              </div>
            </div>
          ) : null}

          {practica && opciones.length === 0 ? (
            <Alert>
              <InfoIcon />
              <AlertDescription>
                Este servicio no tiene un numeral en la Resolución 3100, así que no agrega criterios. Puedes declararlo
                igual.
              </AlertDescription>
            </Alert>
          ) : null}

          {requiereEleccion ? (
            <Seccion titulo="¿Cuál de estos prestas?" ayuda="La norma trata este servicio en varios numerales. Elige el que corresponde; si prestas ambos, declara el servicio una vez por cada uno.">
              <TarjetasRadio
                legend="Numeral de la norma"
                name="numeral"
                columnas={1}
                valor={numeral?.id ?? null}
                onCambio={(id) => {
                  setNumeralId(id);
                  aplicarNumeral(opciones.find((o) => o.id === id) ?? null);
                }}
                opciones={opciones.map((o) => ({ value: o.id, label: `${o.clave} · ${o.nombre}`, ayuda: o.nota }))}
              />
            </Seccion>
          ) : numeral ? (
            <p className="rounded-lg bg-muted/60 p-3 text-sm">
              <span className="text-xs text-muted-foreground">Numeral de la norma</span>
              <span className="block font-medium">
                {numeral.clave} · {numeral.nombre}
              </span>
              {numeral.confianza === "inferida" && numeral.nota ? (
                <span className="block text-xs text-muted-foreground">{numeral.nota}</span>
              ) : null}
            </p>
          ) : null}

          {numeral ? (
            <>
              <Seccion titulo="Complejidad">
                {numeral.complejidades.length === 1 ? (
                  <p className="text-sm">
                    {etiquetaDe(COMPLEJIDADES, numeral.complejidades[0])}{" "}
                    <span className="text-xs text-muted-foreground">(la única que la norma prevé para este servicio)</span>
                  </p>
                ) : (
                  <TarjetasRadio
                    legend="Complejidad"
                    name="complejidad"
                    columnas={3}
                    valor={complejidad}
                    onCambio={setComplejidad}
                    opciones={COMPLEJIDADES.filter((c) => numeral.complejidades.includes(c.value))}
                  />
                )}
              </Seccion>

              <Seccion titulo="¿Dónde y cómo lo prestas?" ayuda="Marca todas las que apliquen.">
                <ChipsMultiples
                  legend="Modalidades"
                  valores={modalidades}
                  onCambio={setModalidades}
                  opciones={MODALIDADES.filter((m) => numeral.modalidades.includes(m.value))}
                />
              </Seccion>

              {conTelemedicina ? (
                <Seccion titulo="Telemedicina">
                  <div className="space-y-3">
                    <ChipsMultiples
                      legend="Categorías de telemedicina"
                      valores={categorias}
                      onCambio={setCategorias}
                      opciones={TELEMEDICINA_CATEGORIAS.filter((c) => numeral.telemedicina_categorias.includes(c.value))}
                    />
                    <ChipsMultiples legend="Rol en telemedicina" valores={roles} onCambio={setRoles} opciones={TELEMEDICINA_ROLES} />
                  </div>
                </Seccion>
              ) : null}
            </>
          ) : null}

          {practica ? (
            <Seccion titulo="Estado del servicio">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Combobox
                  id="estadoServicio"
                  items={ESTADOS_SERVICIO.map((e) => ({ value: e.value, label: e.label }))}
                  value={estado}
                  onValueChange={(v) => v && setEstado(v)}
                />
                {estado === "habilitado" ? (
                  <div className="space-y-1">
                    <Label htmlFor="fechaHabilitacion" className="text-xs text-muted-foreground">
                      Fecha de habilitación (opcional)
                    </Label>
                    <Input id="fechaHabilitacion" type="date" value={fechaHabilitacion} onDateChange={setFechaHabilitacion} />
                  </div>
                ) : estado === "cierre_temporal" ? (
                  <div className="space-y-1">
                    <Label htmlFor="fechaCierre" className="text-xs text-muted-foreground">
                      Fecha del cierre temporal
                    </Label>
                    <Input id="fechaCierre" type="date" value={fechaCierre} onDateChange={setFechaCierre} />
                  </div>
                ) : null}
              </div>
            </Seccion>
          ) : null}

          {numeral ? <PanelPreview listo={listoParaMotor} calculando={calculando} preview={preview} /> : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="button" className="w-full" onClick={guardar} disabled={pending || !practicaId}>
            {pending ? "Guardando..." : editando ? "Guardar cambios" : "Declarar servicio"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none">
      <p className="text-sm font-medium">{titulo}</p>
      {ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
      {children}
    </section>
  );
}

function PanelPreview({ listo, calculando, preview }: { listo: boolean; calculando: boolean; preview: PreviewCriterios | null }) {
  let cuerpo: React.ReactNode;
  if (!listo) {
    cuerpo = <p className="text-sm text-muted-foreground">Completa complejidad y modalidades para ver cuántos criterios te agrega.</p>;
  } else if (!preview || (calculando && preview.agrega === null)) {
    cuerpo = (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" /> Calculando criterios…
      </p>
    );
  } else if (!preview.motorDisponible) {
    cuerpo = <p className="text-sm text-muted-foreground">El cálculo de criterios estará disponible pronto.</p>;
  } else if (preview.error || preview.agrega === null) {
    cuerpo = <p className="text-sm text-muted-foreground">{preview.error ?? "No se pudo calcular el número de criterios."}</p>;
  } else {
    cuerpo = (
      <div className={calculando ? "opacity-60 transition-opacity" : "transition-opacity"} aria-live="polite">
        <p className="text-sm">
          Este servicio te agrega <strong className="text-lg">{fmt(preview.agrega)}</strong> criterio{preview.agrega === 1 ? "" : "s"}.
        </p>
        <p className="text-xs text-muted-foreground">
          Total de la sede con este servicio: {fmt(preview.totalSede ?? 0)} criterios
          {preview.totalSedeEvaluables !== null ? ` (${fmt(preview.totalSedeEvaluables)} para evaluar a mano; el resto son títulos o se cumplen con otros criterios)` : ""}.
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/40 bg-accent/40 p-3">
      <ListChecksIcon className="mt-0.5 size-5 shrink-0 text-accent-foreground" />
      <div className="min-w-0">{cuerpo}</div>
    </div>
  );
}
