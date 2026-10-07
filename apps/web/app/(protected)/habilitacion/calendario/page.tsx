import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import {
  getAccesoHabilitacion,
  getObligacionesClinica,
  getOcurrencias,
  getPerfilPrestador,
  hoyColombia,
} from "@/lib/habilitacion/consultas";
import { aniosSinFestivos, perfilCompleto, sumarDias } from "@/lib/habilitacion/ruta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarioObligaciones, type OtroEvento } from "./calendario-obligaciones";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Calendario regulatorio (HU-5.2): fechas límite de las obligaciones,
// compromisos de planes de mejora y vencimientos de documentos. Mes o
// lista (agenda); la fecha y la vista viajan en la URL como en /citas.
export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireUsuario();
  const acceso = await getAccesoHabilitacion();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const params = await searchParams;
  const hoy = hoyColombia();
  const fecha = typeof params.fecha === "string" && FECHA.test(params.fecha) ? params.fecha : hoy;
  const vista = params.vista === "agenda" ? "agenda" : "month";
  // Rango con margen: el mes visible incluye días del mes anterior/siguiente.
  const desde = vista === "agenda" ? fecha : sumarDias(`${fecha.slice(0, 7)}-01`, -7);
  const hasta = vista === "agenda" ? sumarDias(fecha, 90) : sumarDias(`${fecha.slice(0, 7)}-01`, 45);

  const supabase = await createClient();
  const [perfil, config, ocurrencias, { data: clinicaPais }] = await Promise.all([
    getPerfilPrestador(supabase),
    getObligacionesClinica(supabase),
    getOcurrencias(supabase, desde, hasta),
    supabase.from("clinicas").select("pais_operacion_id").eq("id", usuario.clinica_id).maybeSingle(),
  ]);
  // Festivos sembrados solo hasta cierto año: si el rango visible no tiene ninguno,
  // "día no hábil" cuenta solo fines de semana y las fechas pueden engañar.
  let aniosSinFestivosVisibles: number[] = [];
  if (clinicaPais?.pais_operacion_id) {
    const { data: festivos } = await supabase
      .from("festivos")
      .select("fecha")
      .eq("pais_id", clinicaPais.pais_operacion_id)
      .gte("fecha", `${desde.slice(0, 4)}-01-01`)
      .lte("fecha", `${hasta.slice(0, 4)}-12-31`);
    aniosSinFestivosVisibles = aniosSinFestivos(desde, hasta, (festivos ?? []).map((f) => f.fecha as string));
  }

  if (config === null) {
    return (
      <Alert>
        <TriangleAlertIcon />
        <AlertDescription>El calendario se está terminando de instalar en tu cuenta. Vuelve en unos minutos.</AlertDescription>
      </Alert>
    );
  }
  if (!perfilCompleto(perfil)) {
    return (
      <Card>
        <CardContent className="space-y-2 py-4 text-center">
          <p className="font-medium">Completa tu perfil para ver tu calendario</p>
          <Button variant="outline" nativeButton={false} render={<Link href="/habilitacion/perfil" />}>
            Ir a Perfil
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Planes de mejora y vencimientos de documentos: solo con gestión (Pro).
  const otros: OtroEvento[] = [];
  if (acceso.gestion) {
    const [{ data: planes }, { data: versiones }] = await Promise.all([
      supabase
        .from("hab_planes_mejora")
        .select("id, accion, fecha_compromiso, estado, hab_criterios(codigo)")
        .neq("estado", "cerrada")
        .gte("fecha_compromiso", desde)
        .lte("fecha_compromiso", hasta),
      supabase
        .from("hab_documento_versiones")
        .select("id, documento_id, version, fecha_vencimiento, hab_documentos_clinica(nombre_adicional, hab_documentos_catalogo(nombre_corto))")
        .not("fecha_vencimiento", "is", null)
        .gte("fecha_vencimiento", desde)
        .lte("fecha_vencimiento", hasta),
    ]);
    for (const p of (planes ?? []) as unknown as { id: string; accion: string; fecha_compromiso: string; hab_criterios: { codigo: string } | null }[]) {
      otros.push({ id: p.id, tipo: "plan", fecha: p.fecha_compromiso, titulo: `Plan de mejora ${p.hab_criterios?.codigo ?? ""}`.trim(), detalle: p.accion });
    }
    // Solo la versión vigente (la más alta) de cada documento.
    type Version = { id: string; documento_id: string; version: number; fecha_vencimiento: string; hab_documentos_clinica: { nombre_adicional: string | null; hab_documentos_catalogo: { nombre_corto: string } | null } | null };
    const vigentes = new Map<string, Version>();
    for (const v of (versiones ?? []) as unknown as Version[]) {
      const actual = vigentes.get(v.documento_id);
      if (!actual || v.version > actual.version) vigentes.set(v.documento_id, v);
    }
    for (const v of vigentes.values()) {
      const nombre = v.hab_documentos_clinica?.hab_documentos_catalogo?.nombre_corto ?? v.hab_documentos_clinica?.nombre_adicional ?? "Documento";
      otros.push({ id: v.id, tipo: "documento", fecha: v.fecha_vencimiento, titulo: `Vence: ${nombre}`, detalle: `Versión ${v.version}` });
    }
  }

  return (
    <div className="space-y-3">
      {aniosSinFestivosVisibles.length > 0 ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>
            Los festivos de {aniosSinFestivosVisibles.join(" y ")} aún no están cargados: los días no hábiles de ese periodo solo
            cuentan sábados y domingos, así que una fecha límite podría caer en un festivo sin avisarlo. Confirma las fechas con la
            entidad.
          </AlertDescription>
        </Alert>
      ) : null}
      <CalendarioObligaciones
      fecha={fecha}
      vista={vista}
      hoy={hoy}
      config={config}
      ocurrencias={ocurrencias}
      otros={otros}
      permisos={{ presentar: acceso.gestion && acceso.puedeEditar, anular: acceso.gestion && acceso.puedeAnular }}
      />
    </div>
  );
}
