import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IdCardIcon,
  FileTextIcon,
  StethoscopeIcon,
  CalendarDaysIcon,
  SyringeIcon,
  PhoneCallIcon,
  ClipboardListIcon,
  PencilIcon,
} from "lucide-react";
import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { nombreCompleto } from "@/lib/pacientes/nombre";
import { tieneInfoPendiente, camposFaltantes } from "@/lib/pacientes/completitud";
import { formatoMoneda, hoy } from "@/lib/format";
import {
  getSedesActivas,
  getMediosPagoActivos,
  getTiposTratamientoActivos,
  getTiposIdentificacionActivos,
  getGenerosActivos,
  getPaisesActivos,
  getCanalesCaptacionActivos,
  getCampanasActivas,
  getEpsActivos,
} from "@/lib/catalogos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContactoDialog } from "./contacto-dialog";
import { EvolucionDialog } from "./evolucion-dialog";
import { AnamnesisDialog, type UltimaAnamnesis } from "./anamnesis-dialog";
import {
  etiquetasAntecedentes,
  etiquetasAlergias,
  etiquetasMedicamentos,
  etiquetasHabitos,
} from "@/lib/pacientes/anamnesis-opciones";
import { PacienteDialog } from "../paciente-dialog";
import { TratamientoDialog } from "../../tratamientos/tratamiento-dialog";
import { AnularDialog } from "../../tratamientos/anular-dialog";
import { RevertirAnulacionButton } from "../../tratamientos/revertir-anulacion-button";
import { FotosDialog } from "../../tratamientos/fotos-dialog";
import { AnexosDialog } from "../../tratamientos/anexos-dialog";
import { ConsentimientoDialog } from "../../tratamientos/consentimiento-dialog";
import { InsumosDialog } from "../../tratamientos/insumos-dialog";
import { CitaDialog } from "../../citas/cita-dialog";
import { CitasTabla } from "./citas-tabla";
import type { CitaRow } from "../../citas/tipos";

const TIPO_CONTACTO_LABEL: Record<string, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Correo",
  presencial: "Presencial",
};

const RESULTADO_LABEL: Record<string, string> = {
  agendo_cita: "Agendó cita",
  no_contesto: "No contestó",
  rechazo: "Rechazó",
  pendiente: "Pendiente",
  otro: "Otro",
};

type PacienteCompleto = {
  id: string;
  tipo_identificacion_id: string | null;
  numero_identificacion: string | null;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  fecha_nacimiento: string | null;
  genero_id: string | null;
  nacionalidad_id: string | null;
  pais_residencia_id: string | null;
  canal_captacion_id: string | null;
  campana_id: string | null;
  eps_id: string | null;
  email: string | null;
  telefono1: string | null;
  telefono2: string | null;
  direccion: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  activo: boolean;
  tipos_identificacion: { nombre: string } | null;
  generos: { nombre: string } | null;
  nacionalidad: { nombre: string } | null;
  pais_residencia: { nombre: string } | null;
  canal_captacion: { nombre: string } | null;
  campanas: { nombre: string } | null;
  eps: { nombre: string } | null;
};

type TratamientoRow = {
  id: string;
  fecha: string;
  costo: number | null;
  notas: string | null;
  cufe: string | null;
  anulado: boolean;
  anulado_motivo: string | null;
  paciente_id: string;
  tipo_tratamiento_id: string;
  profesional_id: string;
  sede_id: string;
  medio_pago_id: string;
  tipos_tratamiento: { nombre: string } | null;
  sedes: { nombre: string } | null;
  profesional: { nombre: string } | null;
  tieneFotos: boolean;
  tieneAnexos: boolean;
  tieneConsentimiento: boolean;
};

type Consultorio = { id: string; nombre: string; sede_id: string };

type ConsumoRow = {
  id: string;
  cantidad: number;
  cantidad_invima: number | null;
  sitio_anatomico: string | null;
  created_at: string;
  lotes: { numero_lote: string | null; insumos: { nombre: string; unidad_medida: string } | null } | null;
  tratamientos: { fecha: string } | null;
};

type ContactoRow = {
  id: string;
  fecha: string;
  tipo: string;
  nota: string;
  resultado: string | null;
  proxima_accion_fecha: string | null;
  proxima_accion_nota: string | null;
  creador: { nombre: string } | null;
};

type EvolucionRow = {
  id: string;
  fecha: string;
  evolucion: string;
  tipo: string;
  proximo_control_fecha: string | null;
  tratamiento_id: string | null;
  tratamientos: { tipos_tratamiento: { nombre: string } | null } | null;
  profesional: { nombre: string } | null;
};

type AnamnesisRow = {
  id: string;
  fecha: string;
  motivo_consulta: string;
  antecedentes_personales: string[];
  antecedentes_otros: string | null;
  alergias: string[];
  alergias_otras: string | null;
  medicamentos_actuales: string[];
  medicamentos_otros: string | null;
  habitos: string[];
  fototipo: string | null;
  talla_cm: number | null;
  peso_kg: number | null;
  tipo_sangre: string | null;
  examen_fisico_hallazgos: string | null;
  zona_a_tratar: string | null;
  proximo_control_fecha: string | null;
  profesional: { nombre: string } | null;
};

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="text-sm">{valor ?? "—"}</p>
    </div>
  );
}

export default async function PacienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const usuario = await requireUsuario();
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "pacientes",
    permiso_code: "VIEW",
  });

  if (!puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const { data: pacienteData } = await supabase
    .from("pacientes")
    .select(
      `id, tipo_identificacion_id, numero_identificacion, primer_nombre, segundo_nombre,
       primer_apellido, segundo_apellido, fecha_nacimiento, genero_id, nacionalidad_id,
       pais_residencia_id, canal_captacion_id, campana_id, eps_id, email, telefono1, telefono2,
       direccion, contacto_emergencia_nombre, contacto_emergencia_telefono, activo,
       tipos_identificacion(nombre),
       generos(nombre),
       nacionalidad:paises!pacientes_nacionalidad_id_fkey(nombre),
       pais_residencia:paises!pacientes_pais_residencia_id_fkey(nombre),
       canal_captacion:canales_captacion!pacientes_medio_contacto_id_fkey(nombre),
       campanas(nombre),
       eps(nombre)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!pacienteData) notFound();
  const paciente = pacienteData as unknown as PacienteCompleto;

  const [
    { data: puedeEditarPaciente },
    { data: puedeCrearContacto },
    { data: puedeCrearTratamiento },
    { data: puedeAnularTratamiento },
    { data: puedeRegistrarConsumo },
    { data: puedeRevertirConsumo },
    { data: puedeCrearCita },
    { data: puedeEditarCita },
    { data: tieneEntitlementAnexos },
    tiposIdentificacion,
    generos,
    paises,
    canalesCaptacion,
    campanas,
    eps,
    tiposTratamiento,
    { data: profesionalesData },
    sedes,
    mediosPago,
    { data: insumosData },
    { data: lotesData },
    { data: consultoriosData },
    { data: tratamientosData },
    { data: citasData },
    { data: contactosData },
    { data: evolucionesData },
    { data: anamnesisData },
    { data: consumosData },
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "pacientes", permiso_code: "EDIT" }),
    supabase.rpc("has_permission", { modulo_code: "pacientes", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "tratamientos", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "tratamientos", permiso_code: "VOID" }),
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "VOID" }),
    supabase.rpc("has_permission", { modulo_code: "citas", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "citas", permiso_code: "EDIT" }),
    supabase.rpc("has_entitlement", { modulo_code: "tratamientos", feature_code: "anexos" }),
    getTiposIdentificacionActivos(supabase),
    getGenerosActivos(supabase),
    getPaisesActivos(supabase),
    getCanalesCaptacionActivos(supabase),
    getCampanasActivas(supabase),
    getEpsActivos(supabase),
    getTiposTratamientoActivos(supabase),
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    getSedesActivas(supabase),
    getMediosPagoActivos(supabase),
    supabase.from("insumos").select("id, nombre").eq("activo", true).order("orden"),
    supabase
      .from("lotes")
      .select("id, insumo_id, sede_id, numero_lote, cantidad_actual")
      .eq("activo", true),
    supabase.from("consultorios").select("id, nombre, sede_id").eq("activo", true).order("nombre"),
    supabase
      .from("tratamientos")
      .select(
        `id, fecha, costo, notas, cufe, anulado, anulado_motivo,
         paciente_id, tipo_tratamiento_id, profesional_id, sede_id, medio_pago_id,
         tipos_tratamiento(nombre), sedes(nombre),
         profesional:usuarios!tratamientos_profesional_id_fkey(nombre),
         tratamiento_fotos(count), tratamiento_anexos(count), tratamiento_consentimientos(count)`,
      )
      .eq("paciente_id", id)
      .order("fecha", { ascending: false }),
    supabase
      .from("citas")
      .select(
        `id, fecha, hora_inicio, hora_fin, estado, es_bloqueo, todo_el_dia, motivo,
         paciente_id, profesional_id, tipo_tratamiento_id,
         pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido),
         tipos_tratamiento(nombre),
         profesional:usuarios!citas_profesional_id_fkey(nombre),
         consultorios(nombre, sede_id, sedes(nombre)),
         tratamientos(count), evoluciones_paciente(count)`,
      )
      .eq("paciente_id", id)
      .order("fecha", { ascending: false }),
    supabase
      .from("contactos_paciente")
      .select(
        `id, fecha, tipo, nota, resultado, proxima_accion_fecha, proxima_accion_nota,
         creador:usuarios!contactos_paciente_created_by_fkey(nombre)`,
      )
      .eq("paciente_id", id)
      .order("fecha", { ascending: false }),
    supabase
      .from("evoluciones_paciente")
      .select(
        `id, fecha, evolucion, tipo, proximo_control_fecha, tratamiento_id,
         tratamientos(tipos_tratamiento(nombre)),
         profesional:usuarios!evoluciones_paciente_profesional_id_fkey(nombre)`,
      )
      .eq("paciente_id", id)
      .order("fecha", { ascending: false }),
    supabase
      .from("anamnesis_paciente")
      .select(
        `id, fecha, motivo_consulta, antecedentes_personales, antecedentes_otros,
         alergias, alergias_otras, medicamentos_actuales, medicamentos_otros, habitos,
         fototipo, talla_cm, peso_kg, tipo_sangre, examen_fisico_hallazgos, zona_a_tratar,
         proximo_control_fecha,
         profesional:usuarios!anamnesis_paciente_profesional_id_fkey(nombre)`,
      )
      .eq("paciente_id", id)
      .order("fecha", { ascending: false }),
    supabase
      .from("movimientos_insumos")
      .select(
        `id, cantidad, cantidad_invima, sitio_anatomico, created_at,
         lotes(numero_lote, insumos(nombre, unidad_medida)),
         tratamientos!inner(paciente_id, fecha)`,
      )
      .eq("tratamientos.paciente_id", id)
      .eq("motivo_movimiento", "consumo_tratamiento")
      .order("created_at", { ascending: false }),
  ]);

  const puedeVerAnulados = esAdministrador(usuario);
  const puedeEliminarArchivos = esAdministrador(usuario);
  const pacientePendiente = tieneInfoPendiente(paciente);
  const pacientesPendientes = pacientePendiente ? new Set([paciente.id]) : new Set<string>();
  const tratamientosCompletos = (tratamientosData ?? []).map((t) => {
    const fila = t as unknown as Omit<
      TratamientoRow,
      "tieneFotos" | "tieneAnexos" | "tieneConsentimiento"
    > & {
      tratamiento_fotos?: { count: number }[];
      tratamiento_anexos?: { count: number }[];
      tratamiento_consentimientos?: { count: number }[];
    };
    return {
      ...fila,
      tieneFotos: (fila.tratamiento_fotos?.[0]?.count ?? 0) > 0,
      tieneAnexos: (fila.tratamiento_anexos?.[0]?.count ?? 0) > 0,
      tieneConsentimiento: (fila.tratamiento_consentimientos?.[0]?.count ?? 0) > 0,
    };
  }) as TratamientoRow[];
  const tratamientos = puedeVerAnulados
    ? tratamientosCompletos
    : tratamientosCompletos.filter((t) => !t.anulado);
  const citas = (citasData ?? []).map((c) => {
    const fila = c as unknown as CitaRow & {
      tratamientos?: { count: number }[];
      evoluciones_paciente?: { count: number }[];
    };
    return {
      ...fila,
      tratamientos_count: fila.tratamientos?.[0]?.count ?? 0,
      evoluciones_count: fila.evoluciones_paciente?.[0]?.count ?? 0,
    };
  });
  const contactos = (contactosData ?? []) as unknown as ContactoRow[];
  const evoluciones = (evolucionesData ?? []) as unknown as EvolucionRow[];
  const anamnesis = (anamnesisData ?? []) as unknown as AnamnesisRow[];
  const ultimaAnamnesis: UltimaAnamnesis | null = anamnesis[0] ?? null;
  const tratamientosParaEvolucion = tratamientosCompletos.map((t) => ({
    id: t.id,
    nombre: `${t.fecha} — ${t.tipos_tratamiento?.nombre ?? "Tratamiento"}`,
  }));
  const consumos = (consumosData ?? []) as unknown as ConsumoRow[];
  const profesionales = profesionalesData ?? [];
  const insumos = insumosData ?? [];
  const lotes = lotesData ?? [];
  const consultorios = (consultoriosData ?? []) as Consultorio[];

  const catalogosPaciente = {
    tiposIdentificacion,
    generos,
    paises,
    canalesCaptacion,
    campanas,
    eps,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/pacientes" className="text-sm text-muted-foreground hover:underline">
          ← Volver a Pacientes
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{nombreCompleto(paciente)}</h1>
          <p className="text-sm text-muted-foreground">
            {paciente.numero_identificacion ?? "Sin documento"} ·{" "}
            {paciente.telefono1 ?? paciente.email ?? "sin contacto"}
          </p>
        </div>
        <div className="flex gap-2">
          {pacientePendiente ? (
            <Badge
              variant="outline"
              className="text-amber-600"
              title={`Falta: ${camposFaltantes(paciente).join(", ")}`}
            >
              Información pendiente
            </Badge>
          ) : null}
          <Badge variant={paciente.activo ? "secondary" : "outline"}>
            {paciente.activo ? "Activo" : "Inactivo"}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="datos">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="datos">
            <IdCardIcon /> Datos básicos
          </TabsTrigger>
          <TabsTrigger value="anamnesis">
            <FileTextIcon /> Anamnesis
          </TabsTrigger>
          <TabsTrigger value="tratamientos">
            <StethoscopeIcon /> Tratamientos
          </TabsTrigger>
          <TabsTrigger value="citas">
            <CalendarDaysIcon /> Citas
          </TabsTrigger>
          <TabsTrigger value="insumos">
            <SyringeIcon /> Insumos
          </TabsTrigger>
          <TabsTrigger value="evoluciones">
            <ClipboardListIcon /> Evoluciones
          </TabsTrigger>
          <TabsTrigger value="contactos">
            <PhoneCallIcon /> Contactos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">Datos básicos</CardTitle>
              {puedeEditarPaciente ? (
                <PacienteDialog
                  catalogos={catalogosPaciente}
                  paciente={paciente}
                  trigger={<Button size="sm">Editar paciente</Button>}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Dato
                  etiqueta="Identificación"
                  valor={
                    paciente.numero_identificacion
                      ? `${paciente.tipos_identificacion?.nombre ?? "—"} ${paciente.numero_identificacion}`
                      : "Pendiente"
                  }
                />
                <Dato etiqueta="Nombre completo" valor={nombreCompleto(paciente)} />
                <Dato etiqueta="Fecha de nacimiento" valor={paciente.fecha_nacimiento} />
                <Dato etiqueta="Género" valor={paciente.generos?.nombre} />
                <Dato etiqueta="Nacionalidad" valor={paciente.nacionalidad?.nombre} />
                <Dato etiqueta="País de residencia" valor={paciente.pais_residencia?.nombre} />
                <Dato etiqueta="¿Cómo nos conoció?" valor={paciente.canal_captacion?.nombre} />
                <Dato etiqueta="Campaña" valor={paciente.campanas?.nombre} />
                <Dato etiqueta="EPS" valor={paciente.eps?.nombre} />
                <Dato etiqueta="Correo" valor={paciente.email} />
                <Dato etiqueta="Teléfono principal" valor={paciente.telefono1} />
                <Dato etiqueta="Teléfono alterno" valor={paciente.telefono2} />
                <Dato etiqueta="Dirección" valor={paciente.direccion} />
                <Dato
                  etiqueta="Contacto de emergencia"
                  valor={
                    paciente.contacto_emergencia_nombre
                      ? `${paciente.contacto_emergencia_nombre}${paciente.contacto_emergencia_telefono ? ` · ${paciente.contacto_emergencia_telefono}` : ""}`
                      : null
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anamnesis">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">Anamnesis y examen físico</CardTitle>
              {puedeCrearTratamiento ? (
                <AnamnesisDialog
                  pacienteId={paciente.id}
                  profesionales={profesionales}
                  usuarioActualId={usuario.id}
                  tratamientos={tratamientosParaEvolucion}
                  ultimaAnamnesis={ultimaAnamnesis}
                  trigger={<Button size="sm">Nueva anamnesis</Button>}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Motivo de consulta</TableHead>
                    <TableHead className="hidden md:table-cell">Antecedentes</TableHead>
                    <TableHead className="hidden md:table-cell">Alergias</TableHead>
                    <TableHead className="hidden lg:table-cell">Medicamentos</TableHead>
                    <TableHead className="hidden lg:table-cell">Hábitos</TableHead>
                    <TableHead className="hidden lg:table-cell">Talla/Peso/Sangre</TableHead>
                    <TableHead className="hidden md:table-cell">Profesional</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anamnesis.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-muted-foreground">{a.fecha}</TableCell>
                      <TableCell className="max-w-xs whitespace-normal break-words">
                        {a.motivo_consulta}
                      </TableCell>
                      <TableCell className="hidden max-w-xs whitespace-normal break-words text-muted-foreground md:table-cell">
                        {etiquetasAntecedentes(a.antecedentes_personales)}
                        {a.antecedentes_otros ? ` · ${a.antecedentes_otros}` : ""}
                      </TableCell>
                      <TableCell className="hidden max-w-xs whitespace-normal break-words text-muted-foreground md:table-cell">
                        {etiquetasAlergias(a.alergias)}
                        {a.alergias_otras ? ` · ${a.alergias_otras}` : ""}
                      </TableCell>
                      <TableCell className="hidden max-w-xs whitespace-normal break-words text-muted-foreground lg:table-cell">
                        {etiquetasMedicamentos(a.medicamentos_actuales)}
                        {a.medicamentos_otros ? ` · ${a.medicamentos_otros}` : ""}
                      </TableCell>
                      <TableCell className="hidden max-w-xs whitespace-normal break-words text-muted-foreground lg:table-cell">
                        {etiquetasHabitos(a.habitos)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {[
                          a.talla_cm ? `${a.talla_cm} cm` : null,
                          a.peso_kg ? `${a.peso_kg} kg` : null,
                          a.tipo_sangre,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {a.profesional?.nombre ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {anamnesis.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        Sin anamnesis registrada.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tratamientos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">
                Tratamientos realizados
              </CardTitle>
              {puedeCrearTratamiento ? (
                <TratamientoDialog
                  pacientes={[{ id: paciente.id, nombre: nombreCompleto(paciente) }]}
                  tiposTratamiento={tiposTratamiento}
                  profesionales={profesionales}
                  sedes={sedes}
                  mediosPago={mediosPago}
                  usuarioActualId={usuario.id}
                  pacientesPendientes={pacientesPendientes}
                  desdePaciente={{ id: paciente.id }}
                  trigger={<Button size="sm">Nuevo tratamiento</Button>}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tratamiento</TableHead>
                    <TableHead className="hidden md:table-cell">Sede</TableHead>
                    <TableHead className="hidden md:table-cell">Profesional</TableHead>
                    <TableHead className="hidden md:table-cell">Valor</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tratamientos.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-muted-foreground">{t.fecha}</TableCell>
                      <TableCell className="max-w-[55vw] md:max-w-xs">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`truncate ${t.anulado ? "text-muted-foreground line-through" : ""}`}
                          >
                            {t.tipos_tratamiento?.nombre ?? "—"}
                          </span>
                          {t.anulado ? (
                            <span className="whitespace-normal break-words text-xs text-muted-foreground">
                              Anulado{t.anulado_motivo ? `: ${t.anulado_motivo}` : ""}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {t.sedes?.nombre ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {t.profesional?.nombre ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {formatoMoneda(t.costo)}
                      </TableCell>
                      {/* Sin flex-wrap a propósito: ver el comentario en
                          /tratamientos — un <td> flex que envuelve se encoge
                          al ancho de un solo botón y los apila en columna. */}
                      <TableCell className="flex justify-end gap-2 text-right">
                        <InsumosDialog
                          tratamientoId={t.id}
                          sedeId={t.sede_id}
                          insumos={insumos}
                          lotes={lotes}
                          puedeRegistrar={!!puedeRegistrarConsumo}
                          puedeRevertir={!!puedeRevertirConsumo}
                        />
                        <FotosDialog
                          tratamientoId={t.id}
                          puedeSubir={!!puedeCrearTratamiento}
                          puedeEliminar={puedeEliminarArchivos}
                          tieneArchivos={t.tieneFotos}
                        />
                        <AnexosDialog
                          tratamientoId={t.id}
                          puedeSubir={!!puedeCrearTratamiento}
                          puedeEliminar={puedeEliminarArchivos}
                          tieneArchivos={t.tieneAnexos}
                          tieneEntitlement={!!tieneEntitlementAnexos}
                        />
                        <ConsentimientoDialog
                          tratamientoId={t.id}
                          tieneConsentimiento={t.tieneConsentimiento}
                        />
                        {!t.anulado && puedeCrearTratamiento && puedeAnularTratamiento ? (
                          <TratamientoDialog
                            pacientes={[{ id: paciente.id, nombre: nombreCompleto(paciente) }]}
                            tiposTratamiento={tiposTratamiento}
                            profesionales={profesionales}
                            sedes={sedes}
                            mediosPago={mediosPago}
                            usuarioActualId={usuario.id}
                            pacientesPendientes={pacientesPendientes}
                            editando={{
                              id: t.id,
                              paciente_id: t.paciente_id,
                              tipo_tratamiento_id: t.tipo_tratamiento_id,
                              profesional_id: t.profesional_id,
                              sede_id: t.sede_id,
                              medio_pago_id: t.medio_pago_id,
                              fecha: t.fecha,
                              costo: t.costo,
                              notas: t.notas,
                              cufe: t.cufe,
                            }}
                            trigger={
                              <Button variant="outline" size="sm" aria-label="Editar">
                                <PencilIcon className="md:hidden" />
                                <span className="hidden md:inline">Editar</span>
                              </Button>
                            }
                          />
                        ) : null}
                        {!t.anulado && puedeAnularTratamiento ? <AnularDialog id={t.id} /> : null}
                        {t.anulado && puedeCrearTratamiento ? (
                          <TratamientoDialog
                            pacientes={[{ id: paciente.id, nombre: nombreCompleto(paciente) }]}
                            tiposTratamiento={tiposTratamiento}
                            profesionales={profesionales}
                            sedes={sedes}
                            mediosPago={mediosPago}
                            usuarioActualId={usuario.id}
                            pacientesPendientes={pacientesPendientes}
                            corrigiendo={{
                              id: t.id,
                              paciente_id: t.paciente_id,
                              tipo_tratamiento_id: t.tipo_tratamiento_id,
                              profesional_id: t.profesional_id,
                              sede_id: t.sede_id,
                              medio_pago_id: t.medio_pago_id,
                              fecha: t.fecha,
                              costo: t.costo,
                              notas: t.notas,
                              cufe: t.cufe,
                            }}
                            trigger={
                              <Button variant="outline" size="sm" aria-label="Corregir">
                                <PencilIcon className="md:hidden" />
                                <span className="hidden md:inline">Corregir</span>
                              </Button>
                            }
                          />
                        ) : null}
                        {t.anulado && puedeVerAnulados ? (
                          <RevertirAnulacionButton id={t.id} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {tratamientos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Sin tratamientos registrados.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="citas">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">Citas</CardTitle>
              {puedeCrearCita ? (
                <CitaDialog
                  pacientes={[{ id: paciente.id, nombre: nombreCompleto(paciente) }]}
                  profesionales={profesionales}
                  consultorios={consultorios}
                  sedes={sedes}
                  tiposTratamiento={tiposTratamiento}
                  fechaSeleccionada={hoy()}
                  desdePaciente={{ id: paciente.id }}
                  pacientesPendientes={pacientesPendientes}
                  trigger={<Button size="sm">Nueva cita</Button>}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              <CitasTabla
                citas={citas}
                puedeEditar={!!puedeEditarCita}
                puedeCrearTratamiento={!!puedeCrearTratamiento}
                pacientes={[{ id: paciente.id, nombre: nombreCompleto(paciente) }]}
                tiposTratamiento={tiposTratamiento}
                profesionales={profesionales}
                sedes={sedes}
                mediosPago={mediosPago}
                usuarioActualId={usuario.id}
                pacientesPendientes={pacientesPendientes}
                insumos={insumos}
                lotes={lotes}
                puedeRegistrarConsumo={!!puedeRegistrarConsumo}
                puedeRevertirConsumo={!!puedeRevertirConsumo}
                puedeEliminarArchivos={puedeEliminarArchivos}
                tieneEntitlementAnexos={!!tieneEntitlementAnexos}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insumos">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Insumos usados</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha del tratamiento</TableHead>
                    <TableHead>Insumo</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Sitio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumos.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-muted-foreground">
                        {c.tratamientos?.fecha ?? "—"}
                      </TableCell>
                      <TableCell>{c.lotes?.insumos?.nombre ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.lotes?.numero_lote ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.cantidad} {c.lotes?.insumos?.unidad_medida ?? ""}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.sitio_anatomico ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {consumos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Sin insumos registrados.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evoluciones">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">Evoluciones del paciente</CardTitle>
              {puedeCrearTratamiento ? (
                <div className="flex gap-2">
                  <EvolucionDialog
                    pacienteId={paciente.id}
                    profesionales={profesionales}
                    usuarioActualId={usuario.id}
                    tratamientos={tratamientosParaEvolucion}
                    trigger={<Button size="sm">Nueva evolución</Button>}
                  />
                  <EvolucionDialog
                    pacienteId={paciente.id}
                    profesionales={profesionales}
                    usuarioActualId={usuario.id}
                    tratamientos={tratamientosParaEvolucion}
                    tipo="epicrisis"
                    trigger={
                      <Button size="sm" variant="outline">
                        Registrar epicrisis
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Evolución</TableHead>
                    <TableHead className="hidden md:table-cell">Tratamiento</TableHead>
                    <TableHead className="hidden md:table-cell">Próximo control</TableHead>
                    <TableHead className="hidden md:table-cell">Profesional</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evoluciones.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground">{e.fecha}</TableCell>
                      <TableCell className="max-w-xs whitespace-normal break-words">
                        <div className="flex flex-col gap-1">
                          {e.tipo === "epicrisis" ? (
                            <Badge variant="outline" className="w-fit text-amber-600">
                              Epicrisis
                            </Badge>
                          ) : null}
                          {e.evolucion}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {e.tratamientos?.tipos_tratamiento?.nombre ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {e.proximo_control_fecha ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {e.profesional?.nombre ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {evoluciones.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Sin evoluciones registradas.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contactos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">
                Contactos con el paciente
              </CardTitle>
              {puedeCrearContacto ? <ContactoDialog pacienteId={paciente.id} /> : null}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Próxima acción</TableHead>
                    <TableHead>Registrado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contactos.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-muted-foreground">{c.fecha}</TableCell>
                      <TableCell>{TIPO_CONTACTO_LABEL[c.tipo] ?? c.tipo}</TableCell>
                      <TableCell className="max-w-xs whitespace-normal break-words">{c.nota}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.resultado ? (RESULTADO_LABEL[c.resultado] ?? c.resultado) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.proxima_accion_fecha
                          ? `${c.proxima_accion_fecha}${c.proxima_accion_nota ? ` — ${c.proxima_accion_nota}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.creador?.nombre ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {contactos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Sin contactos registrados.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
