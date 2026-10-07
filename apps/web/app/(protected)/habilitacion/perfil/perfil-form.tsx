"use client";

import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarPerfil } from "@/lib/habilitacion/perfil";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { SIN_SELECCION } from "@/lib/forms/opcional";
import { toItems, toItemsOpcional, type Opcion } from "@/lib/forms/opciones";
import {
  CARACTERISTICAS_PERFIL,
  ESTADOS_REPS,
  NATURALEZAS,
  type EstadoReps,
} from "@/lib/habilitacion/constantes";
import { sugerirVencimientoReps } from "@/lib/habilitacion/ruta";
import type { ClinicaRegulatoria, PerfilPrestador, TipoPrestadorCatalogo } from "@/lib/habilitacion/tipos";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TarjetasRadio } from "../_components/opciones-tarjeta";

// Orden de las preguntas = orden mental de quien llena (UX): situación REPS
// → qué tipo de prestador soy → datos jurídicos → fechas → secretaría →
// características que cambian documentos y reportes.
export function PerfilForm({
  perfil,
  clinica,
  tipos,
  departamentos,
  estadoInicial,
  puedeEditar,
  hoy,
}: {
  perfil: PerfilPrestador | null;
  clinica: ClinicaRegulatoria | null;
  tipos: TipoPrestadorCatalogo[];
  departamentos: Opcion[];
  estadoInicial: EstadoReps | null;
  puedeEditar: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(guardarPerfil, null);
  const [estadoReps, setEstadoReps] = useState<string | null>(perfil?.estado_reps ?? estadoInicial);
  const [tipo, setTipo] = useState<string | null>(perfil?.tipo_prestador ?? null);
  const [fechaInscripcion, setFechaInscripcion] = useState(perfil?.fecha_inscripcion_inicial ?? "");
  const [fechaVencimiento, setFechaVencimiento] = useState(perfil?.fecha_vencimiento_reps ?? "");

  useCerrarAlExito(pending, !state?.error, () => {
    router.refresh();
    toast.add({ title: "Perfil guardado", type: "success" });
  });

  const inscritoOInactivo = estadoReps === "inscrito" || estadoReps === "inactivo";
  const personaJuridica = clinica?.tipo_persona?.codigo === "JURIDICA";
  const sugerida = fechaInscripcion ? sugerirVencimientoReps(fechaInscripcion) : null;

  return (
    // onSubmit + startTransition en vez de action={...}: React 19 resetea un
    // <form action> al terminar y, si el servidor devuelve un error, el
    // usuario perdería lo que escribió en un formulario largo.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => formAction(datos));
      }}
    >
      <fieldset disabled={!puedeEditar || pending} className="space-y-4">
        {state?.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {!puedeEditar ? (
          <Alert>
            <AlertDescription>Puedes consultar el perfil, pero no tienes permiso para editarlo.</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">1. ¿Ya estás inscrito en el REPS?</CardTitle>
            <p className="text-sm text-muted-foreground">
              El REPS es el Registro Especial de Prestadores de Servicios de Salud del Ministerio de Salud.
            </p>
          </CardHeader>
          <CardContent>
            <TarjetasRadio
              legend="Situación ante el REPS"
              name="estadoReps"
              opciones={ESTADOS_REPS}
              valor={estadoReps}
              onCambio={setEstadoReps}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">2. ¿Qué tipo de prestador eres?</CardTitle>
            <p className="text-sm text-muted-foreground">
              Con esto el sistema solo te pide los documentos y reportes que te aplican.
            </p>
          </CardHeader>
          <CardContent>
            <TarjetasRadio
              legend="Tipo de prestador"
              name="tipoPrestador"
              columnas={1}
              opciones={tipos.map((t) => ({
                value: t.codigo,
                label: t.nombre,
                ayuda: t.definicion && t.definicion.length > 220 ? `${t.definicion.slice(0, 217)}…` : t.definicion,
              }))}
              valor={tipo}
              onCambio={setTipo}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">3. Datos jurídicos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-3">
              <Dato etiqueta="Tipo de persona" valor={clinica?.tipo_persona?.nombre} />
              <Dato etiqueta="NIT" valor={clinica?.nit} />
              <Dato etiqueta="Departamento" valor={clinica?.departamento?.nombre} />
              <p className="text-xs text-muted-foreground sm:col-span-3">
                Estos datos vienen de Parámetros → Datos básicos; no se capturan dos veces.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="naturaleza">Naturaleza jurídica</Label>
                <Combobox
                  id="naturaleza"
                  name="naturaleza"
                  items={toItemsOpcional(
                    NATURALEZAS.map((n) => ({ id: n.value, nombre: n.label })),
                    SIN_SELECCION,
                    "Sin definir",
                  )}
                  defaultValue={perfil?.naturaleza ?? SIN_SELECCION}
                />
              </div>
            </div>
            {personaJuridica ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="representanteNombre">Representante legal (opcional)</Label>
                  <Input id="representanteNombre" name="representanteNombre" defaultValue={perfil?.representante_legal_nombre ?? ""} maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="representanteDocumento">Documento del representante (opcional)</Label>
                  <Input id="representanteDocumento" name="representanteDocumento" defaultValue={perfil?.representante_legal_documento ?? ""} maxLength={50} />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">4. Fechas del REPS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {inscritoOInactivo ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fechaInscripcion">Fecha de inscripción inicial (opcional)</Label>
                  <Input
                    id="fechaInscripcion"
                    name="fechaInscripcion"
                    type="date"
                    max={hoy}
                    value={fechaInscripcion}
                    onDateChange={setFechaInscripcion}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fechaVencimiento">
                    Vencimiento de la inscripción{estadoReps === "inscrito" ? "" : " (opcional)"}
                  </Label>
                  <Input
                    id="fechaVencimiento"
                    name="fechaVencimiento"
                    type="date"
                    value={fechaVencimiento}
                    onDateChange={setFechaVencimiento}
                    required={estadoReps === "inscrito"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Cópiala tal como aparece en el REPS. Antes de esa fecha debes hacer la autoevaluación.
                  </p>
                  {sugerida && !fechaVencimiento ? (
                    <button
                      type="button"
                      onClick={() => setFechaVencimiento(sugerida)}
                      className="text-xs font-medium text-accent-foreground underline underline-offset-4"
                    >
                      Usar la fecha sugerida ({sugerida}: inscripción + 4 años)
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fechaPlaneadaRadicacion">¿Cuándo planeas radicar? (opcional)</Label>
                  <Input
                    id="fechaPlaneadaRadicacion"
                    name="fechaPlaneadaRadicacion"
                    type="date"
                    defaultValue={perfil?.fecha_planeada_radicacion ?? ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sirve para revisar que tus documentos sigan vigentes ese día.
                  </p>
                </div>
              </div>
            )}
            {/* Conserva lo ya guardado de las fechas que no se muestran. */}
            {inscritoOInactivo ? (
              <input type="hidden" name="fechaPlaneadaRadicacion" value={perfil?.fecha_planeada_radicacion ?? ""} />
            ) : (
              <>
                <input type="hidden" name="fechaInscripcion" value={fechaInscripcion} />
                <input type="hidden" name="fechaVencimiento" value={fechaVencimiento} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">5. Secretaría de salud</CardTitle>
            <p className="text-sm text-muted-foreground">
              Ante quién estás (o estarás) inscrito. Normalmente es la del departamento; en distritos como Bogotá es
              la secretaría distrital.
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="secretariaDepartamentoId">Departamento o distrito</Label>
              <Combobox
                id="secretariaDepartamentoId"
                name="secretariaDepartamentoId"
                items={[{ value: SIN_SELECCION, label: "Sin definir" }, ...toItems(departamentos)]}
                defaultValue={perfil?.secretaria_departamento_id ?? clinica?.departamento_id ?? SIN_SELECCION}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secretariaNombre">Nombre de la secretaría (opcional)</Label>
              <Input
                id="secretariaNombre"
                name="secretariaNombre"
                defaultValue={perfil?.secretaria_nombre ?? ""}
                placeholder="Ej. Secretaría Distrital de Salud de Bogotá"
                maxLength={200}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">6. Otras características</CardTitle>
            <p className="text-sm text-muted-foreground">
              Marca solo las que apliquen. Cambian qué documentos y reportes te corresponden.
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CARACTERISTICAS_PERFIL.map((c) => (
              <label key={c.campo} className="flex min-h-11 items-start gap-3 rounded-lg border p-3 text-sm">
                <Checkbox name={c.campo} defaultChecked={!!perfil?.[c.campo]} className="mt-0.5" />
                <span>
                  <span className="block font-medium">{c.label}</span>
                  {"ayuda" in c && c.ayuda ? <span className="block text-xs text-muted-foreground">{c.ayuda}</span> : null}
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        {puedeEditar ? (
          <div className="sticky bottom-0 z-10 -mx-1 flex justify-end border-t bg-background/95 px-1 py-3 backdrop-blur">
            <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
              {pending ? "Guardando..." : "Guardar perfil"}
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="font-medium">{valor || "Sin registrar"}</p>
    </div>
  );
}
