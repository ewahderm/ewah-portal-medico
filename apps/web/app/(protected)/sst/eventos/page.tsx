import Link from "next/link";
import { BiohazardIcon, ChevronRightIcon, SirenIcon } from "lucide-react";
import { cn } from "cn";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoSst, getEventos, getPersonas, getSedes } from "@/lib/sst/consultas";
import { GRAVEDADES, TIPOS_EVENTO, etiqueta } from "@/lib/sst/constantes";
import { pendientesEvento } from "@/lib/sst/plazos";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { hoyColombia } from "@/lib/habilitacion/consultas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SemaforoBadge } from "../../habilitacion/_components/semaforo-badge";
import { ReportarEventoBoton } from "./reportar-evento-dialog";

const FILTROS_TIPO = [{ value: "", label: "Todos" }, ...TIPOS_EVENTO.map((t) => ({ value: t.value, label: t.label }))];
const FILTROS_ESTADO = [
  { value: "abiertos", label: "Abiertos" },
  { value: "cerrados", label: "Cerrados" },
  { value: "todos", label: "Todos" },
];

// HU SST-3: lista de incidentes, accidentes y enfermedades laborales con lo
// que falta (reportes e investigación) y su plazo.
export default async function EventosPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireUsuario();
  const acceso = await getAccesoSst();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }
  const q = await searchParams;
  const tipo = typeof q.tipo === "string" && TIPOS_EVENTO.some((t) => t.value === q.tipo) ? q.tipo : "";
  const estado = typeof q.estado === "string" && ["abiertos", "cerrados", "todos"].includes(q.estado) ? q.estado : "abiertos";

  const supabase = await createClient();
  const [eventos, personas, sedes, { data: puedeCrear }] = await Promise.all([
    getEventos(supabase, { tipo: tipo || undefined, estado }),
    getPersonas(supabase),
    getSedes(supabase),
    supabase.rpc("has_permission", { modulo_code: "sst", permiso_code: "CREATE" }),
  ]);
  const nombres = new Map(personas.map((p) => [p.id, p.nombre]));
  const hoy = hoyColombia();
  const href = (cambios: { tipo?: string; estado?: string }) => {
    const p = new URLSearchParams();
    const t = cambios.tipo ?? tipo;
    const e = cambios.estado ?? estado;
    if (t) p.set("tipo", t);
    if (e !== "abiertos") p.set("estado", e);
    const s = p.toString();
    return `/sst/eventos${s ? `?${s}` : ""}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Incidentes, accidentes y enfermedad laboral</CardTitle>
          <p className="text-sm text-muted-foreground">
            Un accidente se reporta a la ARL y a la EPS en 2 días hábiles (el grave o mortal, también a MinTrabajo) y todo
            evento se investiga en 15 días. EWAH te lleva las fechas; el reporte lo haces en el portal de tu ARL.
          </p>
        </div>
        {puedeCrear ? <ReportarEventoBoton personas={personas} sedes={sedes} /> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Tipo" className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTROS_TIPO.map((f) => (
              <Link
                key={f.value || "todos"}
                href={href({ tipo: f.value })}
                aria-current={f.value === tipo ? "page" : undefined}
                className={cn("shrink-0 rounded-full border px-3 py-1 text-sm", f.value === tipo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Estado" className="flex gap-1.5">
            {FILTROS_ESTADO.map((f) => (
              <Link
                key={f.value}
                href={href({ estado: f.value })}
                aria-current={f.value === estado ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1 text-xs", f.value === estado ? "border-primary bg-accent" : "hover:bg-muted")}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </div>

        {eventos.length === 0 ? (
          <div className="space-y-1 py-8 text-center">
            <SirenIcon className="mx-auto size-8 text-muted-foreground" />
            <p className="font-medium">Sin eventos {estado === "abiertos" ? "abiertos" : ""}</p>
            <p className="text-sm text-muted-foreground">Registra también los incidentes: son los que permiten evitar el próximo accidente.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {eventos.map((e) => {
              const pendientes = pendientesEvento(e, e.sst_investigaciones?.estado === "cerrada", hoy);
              const primero = pendientes[0];
              return (
                <li key={e.id}>
                  <Link href={`/sst/eventos/${e.id}`} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="font-medium">{etiqueta(TIPOS_EVENTO, e.tipo_evento)}</span>
                        <span className="text-muted-foreground">{fechaLegible(e.fecha)}</span>
                        {e.gravedad ? (
                          <Badge variant={e.gravedad === "leve" ? "outline" : "destructive"}>{etiqueta(GRAVEDADES, e.gravedad)}</Badge>
                        ) : null}
                        {e.riesgo_biologico ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-800">
                            <BiohazardIcon className="size-3.5" aria-hidden /> Riesgo biológico
                          </span>
                        ) : null}
                        {e.cerrado ? <Badge variant="secondary">Cerrado</Badge> : null}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {nombres.get(e.empleado_id) ?? "Persona retirada"} · {e.resumen}
                      </p>
                      {primero ? <SemaforoBadge semaforo={primero.semaforo} etiqueta={primero.texto} /> : null}
                    </div>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
