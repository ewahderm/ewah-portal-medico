"use client";

import { useMemo, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { actualizarDatosBasicosClinica } from "@/lib/clinicas/actions";
import {
  agregarServicioHabilitado,
  actualizarCodigoServicioHabilitado,
  eliminarServicioHabilitado,
  type ServicioHabilitado,
} from "@/lib/clinicas/servicios-habilitados";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { SIN_SELECCION } from "@/lib/forms/opcional";

type Departamento = { id: string; nombre: string; pais_id: string };
type Ciudad = { id: string; nombre: string; departamento_id: string };
type PracticaMedica = { id: string; codigo: string | null; nombre: string };

type ClinicaDatosBasicos = {
  paisOperacionId: string;
  exoneracionAportes: boolean;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  tipoPersonaId: string | null;
  tipoDocumentoId: string | null;
  rolActorId: string | null;
  tipoTransaccionInvimaId: string | null;
  codigoHabilitacion: string | null;
  claseRiesgoId: string | null;
  departamentoId: string | null;
  ciudadId: string | null;
};

export function DatosBasicosClinicaDialog({
  trigger,
  clinica,
  paises,
  departamentos,
  ciudades,
  clasesRiesgo,
  tiposPersona,
  tiposDocumento,
  rolesActor,
  tiposTransaccionInvima,
  practicasMedicas,
  serviciosHabilitados,
}: {
  trigger: ReactElement;
  clinica: ClinicaDatosBasicos;
  paises: Opcion[];
  departamentos: Departamento[];
  ciudades: Ciudad[];
  clasesRiesgo: Opcion[];
  tiposPersona: Opcion[];
  tiposDocumento: Opcion[];
  rolesActor: Opcion[];
  tiposTransaccionInvima: Opcion[];
  practicasMedicas: PracticaMedica[];
  serviciosHabilitados: ServicioHabilitado[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [paisId, setPaisId] = useState(clinica.paisOperacionId);
  const [departamentoId, setDepartamentoId] = useState(clinica.departamentoId ?? SIN_SELECCION);
  const [ciudadId, setCiudadId] = useState(clinica.ciudadId ?? SIN_SELECCION);

  const itemsPaises = toItems(paises);
  const departamentosFiltrados = departamentos.filter((d) => d.pais_id === paisId);
  const ciudadesFiltradas = ciudades.filter((c) => c.departamento_id === departamentoId);
  const itemsDepartamentos = toItemsOpcional(
    departamentosFiltrados.map((d) => ({ id: d.id, nombre: d.nombre })),
    SIN_SELECCION,
    "Sin especificar",
  );
  const itemsCiudades = toItemsOpcional(
    ciudadesFiltradas.map((c) => ({ id: c.id, nombre: c.nombre })),
    SIN_SELECCION,
    "Sin especificar",
  );
  const itemsClasesRiesgo = toItemsOpcional(clasesRiesgo, SIN_SELECCION, "Sin especificar");
  const itemsTiposPersona = toItemsOpcional(tiposPersona, SIN_SELECCION, "Sin especificar");
  const itemsTiposDocumento = toItemsOpcional(tiposDocumento, SIN_SELECCION, "Sin especificar");
  const itemsRolesActor = toItemsOpcional(rolesActor, SIN_SELECCION, "Sin especificar");
  const itemsTiposTransaccion = toItemsOpcional(tiposTransaccionInvima, SIN_SELECCION, "Sin especificar");

  function handleGuardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await actualizarDatosBasicosClinica(formData);
        router.refresh();
        setOpen(false);
        toast.add({ title: "Datos de la clínica actualizados", type: "success" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setPaisId(clinica.paisOperacionId);
          setDepartamentoId(clinica.departamentoId ?? SIN_SELECCION);
          setCiudadId(clinica.ciudadId ?? SIN_SELECCION);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Datos básicos de la clínica</DialogTitle>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <form action={handleGuardar} className="space-y-5">
          <div className="space-y-3">
            <p className="text-sm font-semibold">Identificación y contacto</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tipoPersonaId" className="font-semibold">Tipo de persona</Label>
                <Combobox id="tipoPersonaId" name="tipoPersonaId" items={itemsTiposPersona}
                  defaultValue={clinica.tipoPersonaId ?? SIN_SELECCION} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipoDocumentoId" className="font-semibold">Tipo de documento</Label>
                <Combobox id="tipoDocumentoId" name="tipoDocumentoId" items={itemsTiposDocumento}
                  defaultValue={clinica.tipoDocumentoId ?? SIN_SELECCION} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="direccion" className="font-semibold">Dirección</Label>
              <Input id="direccion" name="direccion" defaultValue={clinica.direccion ?? ""} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="telefono" className="font-semibold">Teléfono</Label>
                <Input id="telefono" name="telefono" defaultValue={clinica.telefono ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="font-semibold">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={clinica.email ?? ""} />
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-semibold">Ubicación</p>
            <div className="space-y-2">
              <Label htmlFor="paisOperacionId">País donde opera tu clínica</Label>
              <Combobox
                id="paisOperacionId"
                name="paisOperacionId"
                items={itemsPaises}
                value={paisId}
                onValueChange={(v) => {
                  setPaisId(String(v ?? ""));
                  setDepartamentoId(SIN_SELECCION);
                  setCiudadId(SIN_SELECCION);
                }}
                required
              />
              <p className="text-xs text-muted-foreground">
                Si no es Colombia, Nómina solo registra generalidades (sin cálculo legal
                automático) — ver el módulo Recursos Humanos. Departamento/Ciudad hoy solo
                tienen datos sembrados para Colombia.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="departamentoId">Departamento</Label>
                <Combobox
                  id="departamentoId"
                  name="departamentoId"
                  items={itemsDepartamentos}
                  value={departamentoId}
                  onValueChange={(v) => {
                    setDepartamentoId(String(v ?? SIN_SELECCION));
                    setCiudadId(SIN_SELECCION);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ciudadId">Ciudad</Label>
                <Combobox
                  id="ciudadId"
                  name="ciudadId"
                  items={itemsCiudades}
                  value={ciudadId}
                  onValueChange={(v) => setCiudadId(String(v ?? SIN_SELECCION))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-semibold">Registro regulatorio (Colombia)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rolActorId" className="font-semibold">Rol actor (REPS)</Label>
                <Combobox id="rolActorId" name="rolActorId" items={itemsRolesActor}
                  defaultValue={clinica.rolActorId ?? SIN_SELECCION} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipoTransaccionInvimaId" className="font-semibold">Tipo de transacción INVIMA</Label>
                <Combobox id="tipoTransaccionInvimaId" name="tipoTransaccionInvimaId" items={itemsTiposTransaccion}
                  defaultValue={clinica.tipoTransaccionInvimaId ?? SIN_SELECCION} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="codigoHabilitacion" className="font-semibold">Código de habilitación del prestador (REPS)</Label>
              <Input id="codigoHabilitacion" name="codigoHabilitacion" defaultValue={clinica.codigoHabilitacion ?? ""} />
              <p className="text-xs text-muted-foreground">
                El código único de 12 dígitos que REPS asigna a tu clínica como prestador — no
                confundir con los códigos de cada servicio habilitado, que se registran abajo.
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-semibold">Servicios habilitados ante REPS</p>
            <p className="text-xs text-muted-foreground">
              Tu clínica puede estar habilitada para más de un servicio de salud — agrega cada
              uno con el código de habilitación que REPS te asignó para ese servicio. Los cambios
              aquí se guardan de inmediato, no esperan al botón &quot;Guardar&quot; de abajo.
            </p>
            <ServiciosHabilitadosSection
              practicasMedicas={practicasMedicas}
              inicial={serviciosHabilitados}
            />
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-semibold">Nómina</p>
            <div className="space-y-2">
              <Label htmlFor="claseRiesgoId" className="font-semibold">Nivel de riesgo ARL por defecto</Label>
              <Combobox id="claseRiesgoId" name="claseRiesgoId" items={itemsClasesRiesgo}
                defaultValue={clinica.claseRiesgoId ?? SIN_SELECCION} />
              <p className="text-xs text-muted-foreground">
                Se sugiere al crear un cargo nuevo en Recursos Humanos — si un cargo ya tiene
                su propio riesgo asignado, ese es el que se usa para calcular el aporte de ARL
                en Nómina, no este valor. Solo aplica en Colombia.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="exoneracionAportes" name="exoneracionAportes" defaultChecked={clinica.exoneracionAportes} />
              <div className="space-y-1">
                <Label htmlFor="exoneracionAportes" className="font-normal">
                  Mi clínica está exonerada de aportes a salud y parafiscales (Ley 1607 de 2012)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Aplica si tu clínica es persona jurídica declarante de renta — confírmalo con tu
                  contador. Solo afecta el cálculo de nómina en Colombia.
                </p>
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Persiste cada fila de inmediato (agregar/editar código/eliminar), igual
// que activarCups/desactivarCups — vive fuera del <form> grande de arriba
// porque no depende de su botón "Guardar" ni de fn_actualizar_datos_
// basicos_clinica.
function ServiciosHabilitadosSection({
  practicasMedicas,
  inicial,
}: {
  practicasMedicas: PracticaMedica[];
  inicial: ServicioHabilitado[];
}) {
  const [servicios, setServicios] = useState(inicial);
  const [practicaNuevaId, setPracticaNuevaId] = useState(SIN_SELECCION);
  const [codigoNuevo, setCodigoNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const practicasDisponibles = useMemo(() => {
    const yaAgregadas = new Set(servicios.map((s) => s.practicas_medicas?.id));
    return practicasMedicas.filter((p) => !yaAgregadas.has(p.id));
  }, [practicasMedicas, servicios]);

  const itemsPracticas = toItemsOpcional(
    practicasDisponibles.map((p) => ({ id: p.id, nombre: p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre })),
    SIN_SELECCION,
    "Selecciona una práctica médica",
  );

  function handleAgregar() {
    if (practicaNuevaId === SIN_SELECCION) {
      setError("Selecciona una práctica médica.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const creado = await agregarServicioHabilitado(practicaNuevaId, codigoNuevo || null);
        setServicios((actual) => [...actual, creado]);
        setPracticaNuevaId(SIN_SELECCION);
        setCodigoNuevo("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo agregar.");
      }
    });
  }

  function handleActualizarCodigo(id: string, codigo: string) {
    setServicios((actual) => actual.map((s) => (s.id === id ? { ...s, codigo_habilitacion: codigo } : s)));
    startTransition(async () => {
      try {
        await actualizarCodigoServicioHabilitado(id, codigo || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar el código.");
      }
    });
  }

  function handleEliminar(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await eliminarServicioHabilitado(id);
        setServicios((actual) => actual.filter((s) => s.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo eliminar.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {servicios.length > 0 ? (
        <div className="space-y-2">
          {servicios.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-input p-2">
              <div className="flex-1 text-sm">
                <p className="font-medium">{s.practicas_medicas?.nombre ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{s.practicas_medicas?.codigo}</p>
              </div>
              <Input
                className="w-40"
                placeholder="Código de habilitación"
                defaultValue={s.codigo_habilitacion ?? ""}
                onBlur={(e) => handleActualizarCodigo(s.id, e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                onClick={() => handleEliminar(s.id)}
              >
                <XIcon />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-2">
          <Label htmlFor="practicaMedicaNueva">Agregar servicio</Label>
          <Combobox
            id="practicaMedicaNueva"
            items={itemsPracticas}
            value={practicaNuevaId}
            onValueChange={(v) => setPracticaNuevaId(String(v ?? SIN_SELECCION))}
            disabled={practicasDisponibles.length === 0}
          />
        </div>
        <Input
          className="w-40"
          placeholder="Código"
          value={codigoNuevo}
          onChange={(e) => setCodigoNuevo(e.target.value)}
        />
        <Button type="button" variant="outline" disabled={pending} onClick={handleAgregar}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
