"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon, SparklesIcon } from "lucide-react";
import { guardarGrupoSupersalud } from "@/lib/habilitacion/perfil";
import { parsePesos, pesosAUvt, sugerirGrupoSupersalud } from "@/lib/habilitacion/grupo-supersalud";
import {
  CITA_GRUPO_SUPERSALUD,
  DESCRIPCION_GRUPO,
  GRUPOS_SUPERSALUD,
  NATURALEZAS,
  type GrupoSupersalud,
  type Naturaleza,
} from "@/lib/habilitacion/constantes";
import type { RespuestasGrupo } from "@/lib/habilitacion/tipos";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TarjetasRadio } from "../_components/opciones-tarjeta";

const fmt = (n: number) => new Intl.NumberFormat("es-CO").format(n);

// HU-1.2: preguntas → grupo SUGERIDO en vivo (con el porqué) → el usuario
// confirma o corrige. Se guarda lo confirmado; las respuestas quedan como
// snapshot. Las cifras se piden en PESOS (lo que la clínica conoce) y se
// convierten con la UVT del año de corte de valores_legales_pais.
export function AsistenteGrupoDialog({
  naturaleza: naturalezaPerfil,
  grupoActual,
  respuestasPrevias,
  conteoServicios,
  uvt,
  anioCorte,
  hoy,
  trigger,
}: {
  naturaleza: Naturaleza | null;
  grupoActual: GrupoSupersalud | null;
  respuestasPrevias: RespuestasGrupo | null;
  conteoServicios: { alta: number; mediana: number };
  uvt: number | null;
  anioCorte: number;
  hoy: string;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [nitEsEapb, setNitEsEapb] = useState<string | null>(respuestasPrevias ? (respuestasPrevias.nitEsEapb ? "si" : "no") : null);
  const [naturaleza, setNaturaleza] = useState<string | null>(naturalezaPerfil ?? respuestasPrevias?.naturaleza ?? null);
  const [niif, setNiif] = useState<string | null>(respuestasPrevias?.niifGrupo ? String(respuestasPrevias.niifGrupo) : null);
  const [nivel, setNivel] = useState<string | null>(respuestasPrevias?.nivelPublica ? String(respuestasPrevias.nivelPublica) : null);
  const [activos, setActivos] = useState("");
  const [ingresos, setIngresos] = useState("");
  const [patrimonio, setPatrimonio] = useState("");
  const [alta, setAlta] = useState(String(respuestasPrevias?.serviciosAlta ?? conteoServicios.alta));
  const [mediana, setMediana] = useState(String(respuestasPrevias?.serviciosMediana ?? conteoServicios.mediana));
  const [hospitalarios, setHospitalarios] = useState(String(respuestasPrevias?.intramuralesHospitalarios ?? 0));
  const [confirmado, setConfirmado] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoy);

  const respuestas: RespuestasGrupo = useMemo(() => {
    const entero = (t: string) => (t.trim() === "" ? null : Math.max(0, Math.floor(Number(t)) || 0));
    // Si no hay UVT del año se conservan las cifras previas en UVT (si las hay).
    const enUvt = (t: string, previo: number | null | undefined) =>
      t.trim() ? pesosAUvt(parsePesos(t), uvt) : (previo ?? null);
    return {
      nitEsEapb: nitEsEapb === "si",
      naturaleza: (naturaleza as Naturaleza | null) ?? null,
      niifGrupo: niif ? (Number(niif) as 1 | 2 | 3) : null,
      nivelPublica: nivel ? (Number(nivel) as 1 | 2 | 3) : null,
      activosUvt: enUvt(activos, respuestasPrevias?.activosUvt),
      ingresosUvt: enUvt(ingresos, respuestasPrevias?.ingresosUvt),
      patrimonioUvt: enUvt(patrimonio, respuestasPrevias?.patrimonioUvt),
      serviciosAlta: entero(alta),
      serviciosMediana: entero(mediana),
      intramuralesHospitalarios: entero(hospitalarios),
      anioCorte,
      uvtUsada: uvt,
    };
  }, [nitEsEapb, naturaleza, niif, nivel, activos, ingresos, patrimonio, alta, mediana, hospitalarios, uvt, anioCorte, respuestasPrevias]);

  const sugerencia = nitEsEapb ? sugerirGrupoSupersalud(respuestas) : null;
  const grupoFinal = confirmado ?? sugerencia?.grupo ?? grupoActual ?? null;

  function guardar() {
    setError(null);
    if (!grupoFinal) {
      setError("Responde la primera pregunta o elige tu grupo.");
      return;
    }
    startTransition(async () => {
      const r = await guardarGrupoSupersalud({
        grupo: grupoFinal,
        fechaClasificacion: fecha,
        respuestas: nitEsEapb ? respuestas : null,
        sugerido: sugerencia?.grupo ?? null,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
      toast.add({ title: `Grupo ${grupoFinal} guardado`, type: "success" });
    });
  }

  const publica = naturaleza === "publica";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asistente de grupo Supersalud</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Responde con las cifras al 31 de diciembre de {anioCorte}. Te sugerimos un grupo; tú lo confirmas.
          </p>
        </DialogHeader>

        <div className="space-y-5">
          <Pregunta n={1} texto="¿Tu NIT es el mismo de una EPS o entidad administradora de planes de beneficios?">
            <TarjetasRadio
              legend="NIT de EAPB"
              name="nitEsEapb"
              valor={nitEsEapb}
              onCambio={setNitEsEapb}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
            />
          </Pregunta>

          {nitEsEapb === "no" ? (
            <>
              <Pregunta n={2} texto="¿Tu IPS es pública, privada o mixta?">
                <TarjetasRadio legend="Naturaleza" name="naturalezaAsistente" valor={naturaleza} onCambio={setNaturaleza} opciones={NATURALEZAS} columnas={3} />
              </Pregunta>

              {naturaleza ? (
                publica ? (
                  <Pregunta n={3} texto="¿Qué nivel de atención tiene tu IPS pública?">
                    <TarjetasRadio
                      legend="Nivel"
                      name="nivel"
                      valor={nivel}
                      onCambio={setNivel}
                      columnas={3}
                      opciones={[
                        { value: "1", label: "Nivel 1" },
                        { value: "2", label: "Nivel 2" },
                        { value: "3", label: "Nivel 3" },
                      ]}
                    />
                  </Pregunta>
                ) : (
                  <Pregunta n={3} texto="¿Qué grupo de normas contables (NIIF) aplicas?" ayuda="Pregúntale a tu contador si no lo sabes.">
                    <TarjetasRadio
                      legend="Grupo NIIF"
                      name="niif"
                      valor={niif}
                      onCambio={setNiif}
                      columnas={3}
                      opciones={[
                        { value: "1", label: "Grupo 1", ayuda: "Plenas" },
                        { value: "2", label: "Grupo 2", ayuda: "Pymes" },
                        { value: "3", label: "Grupo 3", ayuda: "Microempresas" },
                      ]}
                    />
                  </Pregunta>
                )
              ) : null}

              <Pregunta
                n={4}
                texto="Cifras financieras en pesos (opcional)"
                ayuda={
                  uvt
                    ? `Las convertimos a UVT con el valor de ${anioCorte}: ${fmt(uvt)} pesos.`
                    : `No tenemos el valor de la UVT de ${anioCorte}; estas cifras no se tendrán en cuenta.`
                }
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <CampoPesos id="activos" label="Activos totales" valor={activos} onCambio={setActivos} uvt={uvt} />
                  <CampoPesos id="ingresos" label="Ingresos" valor={ingresos} onCambio={setIngresos} uvt={uvt} />
                  <CampoPesos id="patrimonio" label="Patrimonio" valor={patrimonio} onCambio={setPatrimonio} uvt={uvt} />
                </div>
              </Pregunta>

              <Pregunta n={5} texto="¿Cuántos servicios tienes habilitados?" ayuda="Prellenamos con los servicios declarados en Habilitación; corrígelo si no están todos.">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <CampoNumero id="alta" label="De alta complejidad" valor={alta} onCambio={setAlta} />
                  <CampoNumero id="mediana" label="De mediana complejidad" valor={mediana} onCambio={setMediana} />
                  <CampoNumero id="hosp" label="Intramurales hospitalarios" valor={hospitalarios} onCambio={setHospitalarios} />
                </div>
              </Pregunta>
            </>
          ) : null}

          {sugerencia ? (
            <div className="rounded-xl border border-primary/50 bg-accent/50 p-4 animate-in fade-in duration-200">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <SparklesIcon className="size-4 text-accent-foreground" /> Grupo sugerido: {sugerencia.grupo}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{DESCRIPCION_GRUPO[sugerencia.grupo]}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                {sugerencia.motivos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <a
                href={CITA_GRUPO_SUPERSALUD.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-accent-foreground underline underline-offset-4"
              >
                {CITA_GRUPO_SUPERSALUD.norma} <ExternalLinkIcon className="size-3" />
              </a>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="grupoConfirmado">Tu grupo (confirma o corrige)</Label>
              <Combobox
                id="grupoConfirmado"
                items={GRUPOS_SUPERSALUD.map((g) => ({ value: g, label: `Grupo ${g}` }))}
                value={grupoFinal}
                onValueChange={(v) => setConfirmado(v ?? null)}
                placeholder="Elige tu grupo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaClasificacion">Fecha de la clasificación</Label>
              <Input id="fechaClasificacion" type="date" max={hoy} value={fecha} onDateChange={setFecha} />
            </div>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="button" className="w-full" onClick={guardar} disabled={pending || !grupoFinal}>
            {pending ? "Guardando..." : grupoFinal ? `Confirmar grupo ${grupoFinal}` : "Confirmar grupo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Pregunta({ n, texto, ayuda, children }: { n: number; texto: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
      <p className="text-sm font-medium">
        <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-muted text-xs">{n}</span>
        {texto}
      </p>
      {ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
      {children}
    </section>
  );
}

function CampoPesos({ id, label, valor, onCambio, uvt }: { id: string; label: string; valor: string; onCambio: (v: string) => void; uvt: number | null }) {
  const enUvt = pesosAUvt(parsePesos(valor), uvt);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="numeric" placeholder="$ 0" value={valor} onChange={(e) => onCambio(e.target.value)} disabled={!uvt} />
      {enUvt !== null ? <p className="text-xs text-muted-foreground">≈ {fmt(enUvt)} UVT</p> : null}
    </div>
  );
}

function CampoNumero({ id, label, valor, onCambio }: { id: string; label: string; valor: string; onCambio: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={0} inputMode="numeric" value={valor} onChange={(e) => onCambio(e.target.value)} />
    </div>
  );
}
