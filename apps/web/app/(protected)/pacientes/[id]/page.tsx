import Link from "next/link";
import { notFound } from "next/navigation";
import {
  StethoscopeIcon,
  CalendarDaysIcon,
  SyringeIcon,
  PhoneCallIcon,
} from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { nombreCompleto } from "@/lib/pacientes/nombre";
import { formatoMoneda } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { TratamientoDialog } from "../../tratamientos/tratamiento-dialog";
import { Button } from "@/components/ui/button";

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

type TratamientoRow = {
  id: string;
  fecha: string;
  costo: number | null;
  anulado: boolean;
  tipos_tratamiento: { nombre: string } | null;
  sedes: { nombre: string } | null;
  profesional: { nombre: string } | null;
};

type CitaRow = {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: string;
  tipos_tratamiento: { nombre: string } | null;
  profesional: { nombre: string } | null;
};

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

  const { data: paciente } = await supabase
    .from("pacientes")
    .select(
      "id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, numero_identificacion, email, telefono1, activo",
    )
    .eq("id", id)
    .maybeSingle();

  if (!paciente) notFound();

  const [
    { data: puedeCrearContacto },
    { data: puedeCrearTratamiento },
    { data: tiposTratamientoData },
    { data: profesionalesData },
    { data: sedesData },
    { data: mediosPagoData },
    { data: tratamientosData },
    { data: citasData },
    { data: contactosData },
    { data: consumosData },
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "pacientes", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "tratamientos", permiso_code: "CREATE" }),
    supabase.from("tipos_tratamiento").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("sedes").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("medios_pago").select("id, nombre").eq("activo", true).order("orden"),
    supabase
      .from("tratamientos")
      .select(
        `id, fecha, costo, anulado,
         tipos_tratamiento(nombre), sedes(nombre),
         profesional:usuarios!tratamientos_profesional_id_fkey(nombre)`,
      )
      .eq("paciente_id", id)
      .order("fecha", { ascending: false }),
    supabase
      .from("citas")
      .select(
        `id, fecha, hora_inicio, estado,
         tipos_tratamiento(nombre),
         profesional:usuarios!citas_profesional_id_fkey(nombre)`,
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

  const tratamientos = (tratamientosData ?? []) as unknown as TratamientoRow[];
  const citas = (citasData ?? []) as unknown as CitaRow[];
  const contactos = (contactosData ?? []) as unknown as ContactoRow[];
  const consumos = (consumosData ?? []) as unknown as ConsumoRow[];
  const tiposTratamiento = tiposTratamientoData ?? [];
  const profesionales = profesionalesData ?? [];
  const sedes = sedesData ?? [];
  const mediosPago = mediosPagoData ?? [];

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
            {paciente.numero_identificacion} · {paciente.telefono1 ?? paciente.email ?? "sin contacto"}
          </p>
        </div>
        <Badge variant={paciente.activo ? "secondary" : "outline"}>
          {paciente.activo ? "Activo" : "Inactivo"}
        </Badge>
      </div>

      <Tabs defaultValue="tratamientos">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="tratamientos">
            <StethoscopeIcon /> Tratamientos
          </TabsTrigger>
          <TabsTrigger value="citas">
            <CalendarDaysIcon /> Citas
          </TabsTrigger>
          <TabsTrigger value="insumos">
            <SyringeIcon /> Insumos
          </TabsTrigger>
          <TabsTrigger value="contactos">
            <PhoneCallIcon /> Contactos
          </TabsTrigger>
        </TabsList>

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
                    <TableHead>Sede</TableHead>
                    <TableHead>Profesional</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tratamientos.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-muted-foreground">{t.fecha}</TableCell>
                      <TableCell>{t.tipos_tratamiento?.nombre ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.sedes?.nombre ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.profesional?.nombre ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatoMoneda(t.costo)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.anulado ? "outline" : "secondary"}>
                          {t.anulado ? "Anulado" : "Vigente"}
                        </Badge>
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
            <CardHeader>
              <CardTitle className="text-base font-medium">Citas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Tratamiento</TableHead>
                    <TableHead>Profesional</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {citas.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-muted-foreground">{c.fecha}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.hora_inicio.slice(0, 5)}
                      </TableCell>
                      <TableCell>{c.tipos_tratamiento?.nombre ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.profesional?.nombre ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.estado}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {citas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Sin citas registradas.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
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
                      <TableCell className="max-w-xs">{c.nota}</TableCell>
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
