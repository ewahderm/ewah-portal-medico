"use client";

import { useMemo, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { actualizarDatosBasicosClinica } from "@/lib/clinicas/actions";
import {
  agregarServicioHabilitado,
  actualizarCodigoServicioHabilitado,
  actualizarSedeServicioHabilitado,
  eliminarServicioHabilitado,
  type ServicioHabilitado,
} from "@/lib/clinicas/servicios-habilitados";
import { cn } from "@/lib/utils";
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
  nombreLegal: string;
  nombreComercial: string | null;
  codigoActividadEconomica: string | null;
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
  nit: string;
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
  sedes,
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
  sedes: Opcion[];
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
        <form action={handleGuardar} className="space-y-5">
          <div className="space-y-3">
            <p className="text-sm font-semibold">Identidad de la clínica</p>
            <div className="space-y-2">
              <Label htmlFor="nombreLegal" className="font-semibold">Nombre legal</Label>
              <Input
                id="nombreLegal"
                name="nombreLegal"
                defaultValue={clinica.nombreLegal}
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nombreComercial">Nombre comercial</Label>
              <Input
                id="nombreComercial"
                name="nombreComercial"
                defaultValue={clinica.nombreComercial ?? ""}
                maxLength={200}
                placeholder={clinica.nombreLegal}
              />
              <p className="text-xs text-muted-foreground">
                Es el nombre visible para tus pacientes. Si lo dejas vacío, se usa el nombre legal.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="codigoActividadEconomica">Actividad económica</Label>
              <Input
                id="codigoActividadEconomica"
                name="codigoActividadEconomica"
                inputMode="numeric"
                // Sin pattern a propósito: se puede pegar "3 862101" o
                // "3.862.101" tal como viene en el certificado; el servidor
                // deja solo los dígitos y valida los 7 (lib/clinicas/actions.ts).
                maxLength={15}
                defaultValue={clinica.codigoActividadEconomica ?? ""}
                placeholder="Ej.: 3862101"
              />
              <p className="text-xs text-muted-foreground">
                Código de 7 dígitos del certificado de afiliación a la ARL; el primero indica la clase de riesgo.
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
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
              <Label htmlFor="nit" className="font-semibold">Número de identificación</Label>
              <Input id="nit" name="nit" defaultValue={clinica.nit} required placeholder="Ej. 901759965-1" />
              <p className="text-xs text-muted-foreground">
                El número del documento elegido arriba (NIT con dígito de verificación, cédula, etc.).
                Es el mismo que aparece en los comprobantes de nómina.
              </p>
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
              Tu clínica puede estar habilitada para más de un servicio de salud y en más de
              una sede — agrega cada servicio en la sede donde lo prestas, con el código de
              habilitación que REPS te asignó. Los cambios
              aquí se guardan de inmediato, no esperan al botón &quot;Guardar&quot; de abajo.
            </p>
            <ServiciosHabilitadosSection
              practicasMedicas={practicasMedicas}
              sedes={sedes}
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

          {/* Junto al botón, no arriba: el diálogo es largo y quien guarda está
              abajo — arriba el error quedaba fuera de vista y parecía que
              "Guardar no hace nada". */}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Persiste cada fila de inmediato (agregar/cambiar sede/editar código/
// eliminar), igual que activarCups/desactivarCups — vive fuera del <form>
// grande de arriba porque no depende de su botón "Guardar" ni de
// fn_actualizar_datos_basicos_clinica. Desde 0061 cada fila es
// práctica × sede: primero la sede, luego el grupo y el servicio en
// cascada (mismo patrón que País → Departamento → Ciudad). Un código de
// habilitación por servicio y sede.
function ServiciosHabilitadosSection({
  practicasMedicas,
  sedes,
  inicial,
}: {
  practicasMedicas: PracticaMedica[];
  sedes: Opcion[];
  inicial: ServicioHabilitado[];
}) {
  const [servicios, setServicios] = useState(inicial);
  // Con una sola sede se preselecciona: es el caso más común (consultorio
  // independiente) y evita un paso que no aporta.
  const [sedeId, setSedeId] = useState(sedes.length === 1 ? sedes[0].id : SIN_SELECCION);
  const [grupo, setGrupo] = useState(SIN_SELECCION);
  const [servicioId, setServicioId] = useState(SIN_SELECCION);
  const [codigoNuevo, setCodigoNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const haySedes = sedes.length > 0;
  const itemsSedes = toItemsOpcional(sedes, SIN_SELECCION, "Selecciona una sede");
  const itemsSedesFila = toItemsOpcional(sedes, SIN_SELECCION, "Asigna una sede");

  // Grupos en el orden en que aparecen en el catálogo (ya viene por `orden`).
  const grupos = useMemo(
    () => [...new Set(practicasMedicas.map((pm) => pm.codigo).filter((g): g is string => !!g))],
    [practicasMedicas],
  );
  const itemsGrupos = toItemsOpcional(
    grupos.map((g) => ({ id: g, nombre: g })),
    SIN_SELECCION,
    "Selecciona un grupo",
  );

  // La misma práctica puede repetirse en otra sede, no en la misma.
  const sedeElegida = sedeId === SIN_SELECCION ? null : sedeId;
  const serviciosDelGrupo = useMemo(() => {
    const yaEnLaSede = new Set(
      servicios.filter((s) => s.sede_id === sedeElegida).map((s) => s.practicas_medicas?.id),
    );
    return practicasMedicas.filter((pm) => pm.codigo === grupo && !yaEnLaSede.has(pm.id));
  }, [practicasMedicas, grupo, servicios, sedeElegida]);

  const itemsServicios = toItemsOpcional(
    serviciosDelGrupo.map((pm): Opcion => ({ id: pm.id, nombre: pm.nombre })),
    SIN_SELECCION,
    "Selecciona un servicio",
  );

  function handleAgregar() {
    if (haySedes && sedeId === SIN_SELECCION) {
      setError("Selecciona la sede donde se presta el servicio.");
      return;
    }
    if (servicioId === SIN_SELECCION) {
      setError("Selecciona un grupo y un servicio.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const creado = await agregarServicioHabilitado(servicioId, sedeElegida, codigoNuevo || null);
        setServicios((actual) => [...actual, creado]);
        // Se conservan sede y grupo para seguir agregando servicios.
        setServicioId(SIN_SELECCION);
        setCodigoNuevo("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo agregar.");
      }
    });
  }

  function handleCambiarSede(id: string, nuevaSedeId: string | null) {
    const anterior = servicios.find((s) => s.id === id);
    if (!anterior) return;
    const sede = sedes.find((s) => s.id === nuevaSedeId) ?? null;
    setError(null);
    setServicios((actual) =>
      actual.map((s) =>
        s.id === id ? { ...s, sede_id: sede?.id ?? null, sedes: sede ? { nombre: sede.nombre } : null } : s,
      ),
    );
    startTransition(async () => {
      try {
        await actualizarSedeServicioHabilitado(id, sede?.id ?? null);
      } catch (e) {
        setServicios((actual) => actual.map((s) => (s.id === id ? anterior : s)));
        setError(e instanceof Error ? e.message : "No se pudo cambiar la sede.");
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
          {servicios.map((s) => {
            const nombre = s.practicas_medicas?.nombre ?? "el servicio";
            const sinSede = haySedes && !s.sede_id;
            return (
              <div
                key={s.id}
                className={cn(
                  "space-y-2 rounded-lg border p-2",
                  sinSede ? "border-destructive/50 bg-destructive/5" : "border-input",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{s.practicas_medicas?.nombre ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.practicas_medicas?.codigo}
                      {s.practicas_medicas?.complejidad
                        ? ` · Complejidad ${s.practicas_medicas.complejidad}`
                        : null}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar ${nombre}`}
                    disabled={pending}
                    onClick={() => handleEliminar(s.id)}
                  >
                    <XIcon />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {haySedes ? (
                    <div className="space-y-1">
                      {/* Combobox solo reenvía `id` al input: la etiqueta
                          accesible va por un Label oculto. */}
                      <Label htmlFor={`sede-servicio-${s.id}`} className="sr-only">
                        Sede de {nombre}
                      </Label>
                      <Combobox
                        id={`sede-servicio-${s.id}`}
                        items={itemsSedesFila}
                        value={s.sede_id ?? SIN_SELECCION}
                        onValueChange={(v) => {
                          const valor = String(v ?? SIN_SELECCION);
                          if (valor !== (s.sede_id ?? SIN_SELECCION)) {
                            handleCambiarSede(s.id, valor === SIN_SELECCION ? null : valor);
                          }
                        }}
                      />
                      {sinSede ? (
                        <p className="text-xs text-destructive">
                          Asigna una sede: sin ella este servicio no entra en la autoevaluación de Habilitación.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="self-center text-xs text-muted-foreground">Sin sede</p>
                  )}
                  <Input
                    placeholder="Código de habilitación"
                    aria-label={`Código de habilitación de ${nombre}`}
                    defaultValue={s.codigo_habilitacion ?? ""}
                    onBlur={(e) => handleActualizarCodigo(s.id, e.target.value)}
                  />
                </div>
                {s.practicas_medicas?.requisitos ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-primary">Requisitos</summary>
                    <p className="mt-1 text-muted-foreground">{s.practicas_medicas.requisitos}</p>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-3 rounded-lg border border-dashed border-input p-3">
        {haySedes ? (
          <div className="space-y-2">
            <Label htmlFor="sedeServicioNuevo">1. Sede</Label>
            <Combobox
              id="sedeServicioNuevo"
              items={itemsSedes}
              value={sedeId}
              onValueChange={(v) => {
                setSedeId(String(v ?? SIN_SELECCION));
                setServicioId(SIN_SELECCION);
                setError(null);
              }}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Tu clínica todavía no tiene sedes registradas. Puedes agregar el servicio ahora y
            asignarle la sede después de crearla en la pestaña Sedes.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="grupoServicioNuevo">{haySedes ? "2. Grupo" : "1. Grupo"}</Label>
          <Combobox
            id="grupoServicioNuevo"
            items={itemsGrupos}
            value={grupo}
            onValueChange={(v) => {
              setGrupo(String(v ?? SIN_SELECCION));
              setServicioId(SIN_SELECCION);
              setError(null);
            }}
          />
        </div>

        <div className="space-y-2 border-l-2 border-primary/30 pl-3">
          <Label htmlFor="servicioNuevo">{haySedes ? "3. Servicio" : "2. Servicio"}</Label>
          <Combobox
            id="servicioNuevo"
            items={itemsServicios}
            value={servicioId}
            onValueChange={(v) => setServicioId(String(v ?? SIN_SELECCION))}
            disabled={grupo === SIN_SELECCION || serviciosDelGrupo.length === 0}
          />
          {grupo !== SIN_SELECCION && serviciosDelGrupo.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {haySedes
                ? "Ya agregaste todos los servicios de este grupo en esta sede."
                : "Ya agregaste todos los servicios de este grupo."}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="Código de habilitación"
            aria-label="Código de habilitación del servicio"
            value={codigoNuevo}
            onChange={(e) => setCodigoNuevo(e.target.value)}
          />
          <Button type="button" variant="outline" disabled={pending} onClick={handleAgregar}>
            Agregar
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Los requisitos de cada servicio son material de referencia, no reemplazan el texto de la
        Resolución 3100.
      </p>
    </div>
  );
}
