import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
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

function nombreCompleto(p: {
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
}) {
  return [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido]
    .filter(Boolean)
    .join(" ");
}

function formatoMoneda(valor: number | null) {
  if (valor === null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

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
  await requireUsuario();
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
    { data: tratamientosData },
    { data: citasData },
    { data: contactosData },
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "pacientes", permiso_code: "CREATE" }),
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
  ]);

  const tratamientos = (tratamientosData ?? []) as unknown as TratamientoRow[];
  const citas = (citasData ?? []) as unknown as CitaRow[];
  const contactos = (contactosData ?? []) as unknown as ContactoRow[];

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
        <TabsList>
          <TabsTrigger value="tratamientos">Tratamientos</TabsTrigger>
          <TabsTrigger value="citas">Citas</TabsTrigger>
          <TabsTrigger value="insumos">Insumos</TabsTrigger>
          <TabsTrigger value="contactos">Contactos</TabsTrigger>
        </TabsList>

        <TabsContent value="tratamientos">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Tratamientos realizados
              </CardTitle>
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
              <Alert>
                <AlertDescription>
                  Próximamente — esta pestaña se activa cuando el módulo de Inventario esté
                  listo.
                </AlertDescription>
              </Alert>
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
