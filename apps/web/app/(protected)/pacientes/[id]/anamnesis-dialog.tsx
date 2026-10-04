"use client";

import { useActionState, useState } from "react";
import { crearAnamnesis } from "@/lib/pacientes/anamnesis";
import {
  ANTECEDENTES_PERSONALES,
  ALERGIAS,
  MEDICAMENTOS_ACTUALES,
  HABITOS,
  FOTOTIPOS,
  TIPOS_SANGRE,
  SIN_ANTECEDENTES,
  SIN_ALERGIAS,
} from "@/lib/pacientes/anamnesis-opciones";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { SIN_SELECCION } from "@/lib/forms/opcional";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { toItems, toItemsOpcional, type Opcion } from "@/lib/forms/opciones";
import { hoy } from "@/lib/format";

type OpcionChip = { value: string; label: string };

// Grupo de checkboxes que comparten un mismo `name` (el navegador los agrupa
// solo y el server action los lee con formData.getAll) — mismo mecanismo
// exacto de BloqueoDialog (lib/citas/actions.ts lee profesionalIds así).
// Cuando el grupo tiene un `valorNegativo` ("Sin antecedentes", "NKDA"):
// marcarlo desmarca todo lo demás, marcar cualquier otro lo desmarca a él,
// y si el usuario destilda la última opción positiva, vuelve a caer en el
// negativo solo — nunca queda el grupo completamente vacío y ambiguo.
function GrupoChips({
  name,
  opciones,
  seleccionados,
  onChange,
  valorNegativo,
}: {
  name: string;
  opciones: OpcionChip[];
  seleccionados: Set<string>;
  onChange: (siguiente: Set<string>) => void;
  valorNegativo?: string;
}) {
  function alternar(valor: string, marcado: boolean) {
    const siguiente = new Set(seleccionados);
    if (marcado) {
      if (valorNegativo && valor === valorNegativo) {
        siguiente.clear();
      } else if (valorNegativo) {
        siguiente.delete(valorNegativo);
      }
      siguiente.add(valor);
    } else {
      siguiente.delete(valor);
      if (valorNegativo && siguiente.size === 0) siguiente.add(valorNegativo);
    }
    onChange(siguiente);
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {opciones.map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-sm">
          <Checkbox
            name={name}
            value={o.value}
            checked={seleccionados.has(o.value)}
            onCheckedChange={(marcado) => alternar(o.value, marcado === true)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export type UltimaAnamnesis = {
  antecedentes_personales: string[];
  antecedentes_otros: string | null;
  alergias: string[];
  alergias_otras: string | null;
  medicamentos_actuales: string[];
  medicamentos_otros: string | null;
  habitos: string[];
  fototipo: string | null;
  tipo_sangre: string | null;
};

export function AnamnesisDialog({
  pacienteId,
  profesionales,
  usuarioActualId,
  tratamientos,
  ultimaAnamnesis,
  trigger,
  onGuardado,
}: {
  pacienteId: string;
  profesionales: Opcion[];
  usuarioActualId: string;
  /** Tratamientos previos de este paciente, para ligar opcionalmente esta
   * anamnesis a uno de ellos (examen previo a un procedimiento concreto). */
  tratamientos?: Opcion[];
  /** La anamnesis más reciente de este paciente, si existe — habilita el
   * botón "Copiar de la última anamnesis". */
  ultimaAnamnesis?: UltimaAnamnesis | null;
  trigger: React.ReactElement;
  onGuardado?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearAnamnesis, null);

  const [antecedentes, setAntecedentes] = useState<Set<string>>(new Set([SIN_ANTECEDENTES]));
  const [antecedentesOtros, setAntecedentesOtros] = useState("");
  const [alergias, setAlergias] = useState<Set<string>>(new Set([SIN_ALERGIAS]));
  const [alergiasOtras, setAlergiasOtras] = useState("");
  const [medicamentos, setMedicamentos] = useState<Set<string>>(new Set());
  const [medicamentosOtros, setMedicamentosOtros] = useState("");
  const [habitos, setHabitos] = useState<Set<string>>(new Set());
  const [fototipo, setFototipo] = useState(SIN_SELECCION);
  // Tipo de sangre no cambia entre visitas, así que sí se copia — talla y
  // peso en cambio se vuelven a medir cada vez, por eso arrancan en blanco
  // incluso al usar "Copiar de la última anamnesis".
  const [tipoSangre, setTipoSangre] = useState(SIN_SELECCION);

  function copiarDeLaUltima() {
    if (!ultimaAnamnesis) return;
    setAntecedentes(
      ultimaAnamnesis.antecedentes_personales.length
        ? new Set(ultimaAnamnesis.antecedentes_personales)
        : new Set([SIN_ANTECEDENTES]),
    );
    setAntecedentesOtros(ultimaAnamnesis.antecedentes_otros ?? "");
    setAlergias(
      ultimaAnamnesis.alergias.length ? new Set(ultimaAnamnesis.alergias) : new Set([SIN_ALERGIAS]),
    );
    setAlergiasOtras(ultimaAnamnesis.alergias_otras ?? "");
    setMedicamentos(new Set(ultimaAnamnesis.medicamentos_actuales));
    setMedicamentosOtros(ultimaAnamnesis.medicamentos_otros ?? "");
    setHabitos(new Set(ultimaAnamnesis.habitos));
    setFototipo(ultimaAnamnesis.fototipo ?? SIN_SELECCION);
    setTipoSangre(ultimaAnamnesis.tipo_sangre ?? SIN_SELECCION);
  }

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    onGuardado?.();
    toast.add({ title: "Anamnesis registrada", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva anamnesis</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="pacienteId" value={pacienteId} />

          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          {ultimaAnamnesis ? (
            <button
              type="button"
              className="text-xs text-accent-foreground hover:underline"
              onClick={copiarDeLaUltima}
            >
              Copiar de la última anamnesis
            </button>
          ) : null}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input id="fecha" name="fecha" type="date" required defaultValue={hoy()} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profesionalId">Profesional</Label>
              <Combobox
                id="profesionalId"
                name="profesionalId"
                required
                items={toItems(profesionales)}
                defaultValue={usuarioActualId}
                placeholder="Selecciona"
              />
            </div>
          </div>

          {tratamientos && tratamientos.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="tratamientoId">Tratamiento relacionado (opcional)</Label>
              <Combobox
                id="tratamientoId"
                name="tratamientoId"
                items={toItemsOpcional(tratamientos, SIN_SELECCION, "Ninguno")}
                defaultValue={SIN_SELECCION}
                placeholder="Selecciona"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="motivoConsulta">Motivo de consulta y enfermedad actual</Label>
            <Textarea
              id="motivoConsulta"
              name="motivoConsulta"
              rows={4}
              required
              placeholder="¿Por qué consulta? ¿Desde cuándo? ¿Cómo ha evolucionado?"
            />
          </div>

          <div className="space-y-2">
            <Label>Antecedentes personales</Label>
            <GrupoChips
              name="antecedentesPersonales"
              opciones={ANTECEDENTES_PERSONALES}
              seleccionados={antecedentes}
              onChange={setAntecedentes}
              valorNegativo={SIN_ANTECEDENTES}
            />
            <Input
              placeholder="Otros antecedentes (opcional)"
              value={antecedentesOtros}
              onChange={(e) => setAntecedentesOtros(e.target.value)}
              name="antecedentesOtros"
            />
          </div>

          <div className="space-y-2">
            <Label>Alergias</Label>
            <GrupoChips
              name="alergias"
              opciones={ALERGIAS}
              seleccionados={alergias}
              onChange={setAlergias}
              valorNegativo={SIN_ALERGIAS}
            />
            <Input
              placeholder="Otras alergias (opcional)"
              value={alergiasOtras}
              onChange={(e) => setAlergiasOtras(e.target.value)}
              name="alergiasOtras"
            />
          </div>

          <div className="space-y-2">
            <Label>Medicamentos actuales relevantes (opcional)</Label>
            <GrupoChips
              name="medicamentosActuales"
              opciones={MEDICAMENTOS_ACTUALES}
              seleccionados={medicamentos}
              onChange={setMedicamentos}
            />
            <Input
              placeholder="Otros medicamentos (opcional)"
              value={medicamentosOtros}
              onChange={(e) => setMedicamentosOtros(e.target.value)}
              name="medicamentosOtros"
            />
          </div>

          <div className="space-y-2">
            <Label>Hábitos (opcional)</Label>
            <GrupoChips name="habitos" opciones={HABITOS} seleccionados={habitos} onChange={setHabitos} />
          </div>

          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Examen físico</p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tallaCm">Talla (cm, opcional)</Label>
              <Input id="tallaCm" name="tallaCm" type="number" min="0" step="1" placeholder="Ej: 165" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pesoKg">Peso (kg, opcional)</Label>
              <Input id="pesoKg" name="pesoKg" type="number" min="0" step="0.1" placeholder="Ej: 62.5" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipoSangre">Tipo de sangre (opcional)</Label>
              <Combobox
                id="tipoSangre"
                name="tipoSangre"
                items={[{ value: SIN_SELECCION, label: "Sin registrar" }, ...TIPOS_SANGRE]}
                value={tipoSangre}
                onValueChange={(v) => setTipoSangre(String(v ?? SIN_SELECCION))}
                placeholder="Selecciona"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fototipo">Fototipo (opcional)</Label>
              <Combobox
                id="fototipo"
                name="fototipo"
                items={[{ value: SIN_SELECCION, label: "Sin registrar" }, ...FOTOTIPOS]}
                value={fototipo}
                onValueChange={(v) => setFototipo(String(v ?? SIN_SELECCION))}
                placeholder="Selecciona"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zonaATratar">Zona a tratar (opcional)</Label>
              <Input id="zonaATratar" name="zonaATratar" placeholder="Ej: Tercio superior" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="examenFisicoHallazgos">Hallazgos / lesiones (opcional)</Label>
            <Textarea
              id="examenFisicoHallazgos"
              name="examenFisicoHallazgos"
              rows={3}
              placeholder="Descripción de lo observado al examen"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="proximoControlFecha">Próximo control (opcional)</Label>
            <Input id="proximoControlFecha" name="proximoControlFecha" type="date" />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Registrar anamnesis"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
