"use client";

import { useActionState, useState } from "react";
import { crearTratamiento, editarTratamiento } from "@/lib/tratamientos/actions";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
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
import { toItems, type Opcion } from "@/lib/forms/opciones";
import { formatoMoneda, hoy } from "@/lib/format";
import { obtenerPreciosTratamiento } from "@/lib/tratamientos/cobros";
import { precioVigente, type PrecioTratamiento } from "@/lib/tratamientos/precios";
import { AvisoCatalogoVacio } from "../_components/aviso-catalogo-vacio";

type Correccion = {
  id: string;
  paciente_id: string;
  tipo_tratamiento_id: string;
  profesional_id: string;
  sede_id: string;
  medio_pago_id: string | null;
  fecha: string;
  costo: number | null;
  valor_cobrado: number | null;
  // Con cobro vigente, lo cobrado no cambia al editar (lo pagado es lo pagado).
  cobro_id: string | null;
  notas: string | null;
  cufe: string | null;
};

// Todo tratamiento nuevo cuelga de una atención — si no viene de
// corrigiendo/editando (que la heredan del original en el servidor), viene
// de este contexto: el detalle de una atención ya creada (con o sin cita
// detrás, no hace falta distinguirlo aquí).
type DesdeAtencion = {
  id: string;
  paciente_id: string;
  profesional_id: string;
  tipo_tratamiento_id: string | null;
  fecha: string;
};

export function TratamientoDialog({
  pacientes,
  tiposTratamiento,
  profesionales,
  sedes,
  usuarioActualId,
  corrigiendo,
  editando,
  desdeAtencion,
  lugar,
  pacientesPendientes = new Set(),
  onGuardado,
  trigger,
}: {
  pacientes: Opcion[];
  tiposTratamiento: Opcion[];
  profesionales: Opcion[];
  sedes: Opcion[];
  usuarioActualId: string;
  corrigiendo?: Correccion;
  editando?: Correccion;
  desdeAtencion?: DesdeAtencion;
  /** Dónde ocurrió la atención (sede, y consultorio si lo hay). Si viene,
   * el tratamiento lo hereda: no se vuelve a pedir la sede. La BD igual lo
   * fuerza al guardar (trigger tratamientos_hereda_lugar, 0108). */
  lugar?: { sede_id: string; texto: string };
  pacientesPendientes?: Set<string>;
  /** Se dispara además del toast, al guardar con éxito — para que quien
   * embebe este diálogo (ej. el detalle de una cita) pueda refrescar su
   * propia lista sin depender de que el usuario cierre/reabra. */
  onGuardado?: () => void;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    editando ? editarTratamiento : crearTratamiento,
    null,
  );
  // Corregir (registro ya anulado) y Editar (atajo anular+corregir) parten
  // de la misma forma de tratamiento — solo difieren en qué campo oculto
  // envían y en qué acción de servidor invocan.
  const prefill = corrigiendo ?? editando;
  const pacienteInicial = prefill?.paciente_id ?? desdeAtencion?.paciente_id ?? "";
  const pacienteFijo = Boolean(prefill || desdeAtencion);
  const [pacienteId, setPacienteId] = useState(pacienteInicial);
  const pacientePendiente = pacientesPendientes.has(pacienteId);

  // Precio: se propone el vigente para el tipo y la fecha; si la persona lo
  // cambia a mano, ya no se pisa. Lo cobrado sigue al precio hasta que se
  // escriba aparte (por ejemplo, un descuento solo para este tratamiento).
  const [precios, setPrecios] = useState<PrecioTratamiento[] | null>(null);
  const [tipoId, setTipoId] = useState(prefill?.tipo_tratamiento_id ?? desdeAtencion?.tipo_tratamiento_id ?? "");
  const [fecha, setFecha] = useState(prefill?.fecha ?? desdeAtencion?.fecha ?? hoy());
  const [precio, setPrecio] = useState(prefill?.costo != null ? String(prefill.costo) : "");
  const [precioPropio, setPrecioPropio] = useState(Boolean(prefill));
  const [cobrado, setCobrado] = useState(
    prefill?.valor_cobrado != null ? String(prefill.valor_cobrado) : prefill?.costo != null ? String(prefill.costo) : "",
  );
  const [cobradoPropio, setCobradoPropio] = useState(
    prefill ? prefill.valor_cobrado != null && prefill.valor_cobrado !== prefill.costo : false,
  );
  const yaCobrado = Boolean(editando?.cobro_id);
  const deLista = precios && tipoId ? precioVigente(precios, tipoId, fecha) : null;

  function proponer(lista: PrecioTratamiento[], tipo: string, dia: string, forzar = false) {
    if (!tipo || (precioPropio && !forzar)) return;
    const p = precioVigente(lista, tipo, dia);
    if (p === null) return;
    setPrecio(String(p));
    if (!cobradoPropio) setCobrado(String(p));
  }

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    onGuardado?.();
    toast.add({
      title: corrigiendo
        ? "Tratamiento corregido"
        : editando
          ? "Tratamiento editado"
          : "Tratamiento registrado",
      type: "success",
    });
  });

  // El paciente ya viene fijo (ficha del paciente, "Atender" desde una
  // cita, o Editar/Corregir de un tratamiento existente) y tiene
  // información obligatoria pendiente: ni se abre el diálogo, el botón
  // se ve deshabilitado con una pista de por qué. No se usa cloneElement
  // para forzar disabled=true: `trigger` llega desde un Server Component
  // (page.tsx) como elemento ya serializado cruzando el límite server/cliente,
  // y clonarlo con props nuevas rompe su `type` en este Next.js ("Element
  // type is invalid") — ver node_modules/next/dist/docs/01-app/02-guides/
  // server-and-client-boundary.md. En su lugar se simula el estado disabled
  // con CSS sobre un <span> envolvente (mismo opacity-50 que usa el botón
  // real al deshabilitarse) y el title va en ese span, no en el botón, por
  // la misma razón que antes: pointer-events:none en el hijo impediría que
  // un title puesto directamente en el botón se disparara.
  if (pacienteFijo && pacientesPendientes.has(pacienteInicial)) {
    return (
      <span
        className="inline-block cursor-not-allowed opacity-50 [&>*]:pointer-events-none"
        title="Este paciente tiene información obligatoria pendiente — complétala en su ficha primero."
      >
        {trigger}
      </span>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && precios === null) {
          obtenerPreciosTratamiento().then((lista) => {
            setPrecios(lista);
            proponer(lista, tipoId, fecha);
          });
        }
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {corrigiendo
              ? "Corregir tratamiento"
              : editando
                ? "Editar tratamiento"
                : "Nuevo tratamiento"}
          </DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {corrigiendo ? (
            <input type="hidden" name="corrigeA" value={corrigiendo.id} />
          ) : null}
          {editando ? <input type="hidden" name="editaId" value={editando.id} /> : null}
          {desdeAtencion ? <input type="hidden" name="atencionId" value={desdeAtencion.id} /> : null}

          {corrigiendo ? (
            <Alert>
              <AlertDescription>
                Este registro anulado no se modifica. Al guardar se crea un tratamiento
                nuevo que lo corrige.
              </AlertDescription>
            </Alert>
          ) : null}
          {editando ? (
            <Alert>
              <AlertDescription>
                El registro actual se anulará y se creará uno nuevo con estos datos — un
                tratamiento nunca se edita in-place.
              </AlertDescription>
            </Alert>
          ) : null}

          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          {/* Lo que ya se sabe por la atención no se vuelve a digitar: se
              muestra y viaja en campos ocultos. */}
          {desdeAtencion || lugar ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
              {desdeAtencion ? (
                <>
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <dt className="text-xs text-muted-foreground">Paciente</dt>
                    <dd className="font-medium break-words">
                      {pacientes.find((p) => p.id === pacienteId)?.nombre ?? "—"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Fecha</dt>
                    <dd className="font-medium">{desdeAtencion.fecha}</dd>
                  </div>
                </>
              ) : null}
              {lugar ? (
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Lugar</dt>
                  <dd className="font-medium break-words">{lugar.texto}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {desdeAtencion ? (
            <>
              <input type="hidden" name="pacienteId" value={pacienteId} />
              <input type="hidden" name="fecha" value={desdeAtencion.fecha} />
            </>
          ) : null}
          {lugar ? <input type="hidden" name="sedeId" value={lugar.sede_id} /> : null}

          {desdeAtencion ? null : (
            <div className="space-y-2">
              <Label htmlFor="pacienteId">Paciente</Label>
              <Combobox
                id="pacienteId"
                name="pacienteId"
                required
                items={toItems(pacientes)}
                value={pacienteId}
                onValueChange={(valor) => setPacienteId(String(valor ?? ""))}
                placeholder="Selecciona un paciente"
              />
            </div>
          )}
          {pacientePendiente ? (
            <Alert variant="destructive">
              <AlertDescription>
                Este paciente tiene información obligatoria pendiente. Complétala en su
                ficha antes de registrar un tratamiento.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="tipoTratamientoId">Tipo de tratamiento</Label>
            <Combobox
              id="tipoTratamientoId"
              name="tipoTratamientoId"
              required
              items={toItems(tiposTratamiento)}
              defaultValue={prefill?.tipo_tratamiento_id ?? desdeAtencion?.tipo_tratamiento_id ?? undefined}
              onValueChange={(valor) => {
                const tipo = String(valor ?? "");
                setTipoId(tipo);
                // Elegir otro tipo siempre propone su precio.
                if (precios) proponer(precios, tipo, fecha, true);
                setPrecioPropio(false);
              }}
              placeholder="Selecciona un tratamiento"
            />
            {tiposTratamiento.length === 0 ? (
              <AvisoCatalogoVacio>
                Todavía no tienes tipos de tratamiento. Créalos en Tratamientos → Tipos de tratamiento para poder
                registrar uno.
              </AvisoCatalogoVacio>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profesionalId">Profesional</Label>
              <Combobox
                id="profesionalId"
                name="profesionalId"
                required
                items={toItems(profesionales)}
                defaultValue={prefill?.profesional_id ?? desdeAtencion?.profesional_id ?? usuarioActualId}
                placeholder="Selecciona"
              />
            </div>
            {desdeAtencion ? null : (
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha</Label>
                <Input
                  id="fecha"
                  name="fecha"
                  type="date"
                  required
                  value={fecha}
                  onChange={(e) => {
                    setFecha(e.target.value);
                    if (precios) proponer(precios, tipoId, e.target.value);
                  }}
                />
              </div>
            )}
            {lugar ? null : (
              <div className="space-y-2">
                <Label htmlFor="sedeId">Sede</Label>
                <Combobox
                  id="sedeId"
                  name="sedeId"
                  required
                  items={toItems(sedes)}
                  defaultValue={prefill?.sede_id}
                  placeholder="Selecciona"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="costo">Precio</Label>
              <Input
                id="costo"
                name="costo"
                type="number"
                inputMode="numeric"
                min="0"
                step="1000"
                placeholder="0"
                required
                value={precio}
                onChange={(e) => {
                  setPrecio(e.target.value);
                  setPrecioPropio(true);
                  if (!cobradoPropio) setCobrado(e.target.value);
                }}
              />
              {deLista !== null && precio !== "" && Number(precio) !== deLista ? (
                <p className="text-xs text-muted-foreground">Precio de lista: {formatoMoneda(deLista)}</p>
              ) : precios && tipoId && deLista === null ? (
                <p className="text-xs text-muted-foreground">Este tipo aún no tiene precio en Parámetros.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorCobrado">Valor cobrado</Label>
              <Input
                id="valorCobrado"
                name="valorCobrado"
                type="number"
                inputMode="numeric"
                min="0"
                step="1000"
                placeholder="0"
                value={cobrado}
                readOnly={yaCobrado}
                onChange={(e) => {
                  setCobrado(e.target.value);
                  setCobradoPropio(true);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {yaCobrado
                  ? "Ya se cobró en la atención: lo cobrado no cambia al editar."
                  : "Igual al precio, salvo un descuento solo para este tratamiento. El de toda la atención se hace al cobrarla."}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notas">Observaciones (opcional)</Label>
            <Textarea
              id="notas"
              name="notas"
              rows={3}
              placeholder="Evolución, indicaciones, reacciones..."
              defaultValue={prefill?.notas ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cufe">CUFE (opcional)</Label>
            <Input
              id="cufe"
              name="cufe"
              placeholder="Código de la factura electrónica"
              defaultValue={prefill?.cufe ?? ""}
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending || pacientePendiente}>
            {pending
              ? "Guardando..."
              : corrigiendo
                ? "Guardar corrección"
                : editando
                  ? "Guardar edición"
                  : "Registrar tratamiento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
