import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import {
  getAccesoHabilitacion,
  getNovedades,
  getObligacionesClinica,
  getOcurrencias,
  getPerfilPrestador,
  getSedesConServicios,
  getUsuariosClinica,
  hoyColombia,
} from "@/lib/habilitacion/consultas";
import { perfilCompleto, sumarDias } from "@/lib/habilitacion/ruta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ObligacionesCliente } from "./obligaciones-cliente";
import { Novedades } from "./novedades";

// Etapa 5 (HU-5.1, HU-5.5): qué reportes te tocan, a quién y cuándo, y las
// novedades del REPS. Todos los planes ven la lista; configurar, presentar
// y reportar novedades es gestión (Pro).
export default async function ObligacionesPage() {
  await requireUsuario();
  const acceso = await getAccesoHabilitacion();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const supabase = await createClient();
  const hoy = hoyColombia();
  const [perfil, config, ocurrencias, usuarios, novedades, { sedes }] = await Promise.all([
    getPerfilPrestador(supabase),
    getObligacionesClinica(supabase),
    getOcurrencias(supabase, sumarDias(hoy, -400), sumarDias(hoy, 550)),
    getUsuariosClinica(supabase),
    acceso.gestion ? getNovedades(supabase) : Promise.resolve(null),
    getSedesConServicios(supabase),
  ]);

  if (config === null) {
    return (
      <Alert>
        <TriangleAlertIcon />
        <AlertDescription>Las obligaciones se están terminando de instalar en tu cuenta. Vuelve en unos minutos.</AlertDescription>
      </Alert>
    );
  }
  if (!perfilCompleto(perfil)) {
    return (
      <Card>
        <CardContent className="space-y-2 py-4 text-center">
          <p className="font-medium">Completa tu perfil para ver tus obligaciones</p>
          <p className="text-sm text-muted-foreground">
            Qué reportes te tocan depende de tu tipo de prestador, tu grupo en la Supersalud y tus servicios.
          </p>
          <Button variant="outline" nativeButton={false} render={<Link href="/habilitacion/perfil" />}>
            Ir a Perfil
          </Button>
        </CardContent>
      </Card>
    );
  }

  const gestiona = acceso.gestion && acceso.puedeEditar;
  return (
    <div className="space-y-6">
      <ObligacionesCliente
        config={config}
        ocurrencias={ocurrencias}
        usuarios={usuarios}
        hoy={hoy}
        permisos={{ configurar: gestiona, presentar: gestiona, anular: acceso.gestion && acceso.puedeAnular, recalcular: acceso.puedeEditar, registrar: gestiona && acceso.puedeCrear }}
        sinGrupo={perfil?.tipo_prestador === "ips" && !perfil.grupo_supersalud}
      />
      {novedades ? (
        <Novedades
          catalogo={novedades.catalogo}
          reportadas={novedades.reportadas}
          sedes={sedes.map((s) => ({ id: s.id, nombre: s.nombre, servicios: s.servicios.map((v) => ({ id: v.id, nombre: v.practicas_medicas?.nombre ?? "Servicio", estado: v.estado })) }))}
          puedeCrear={acceso.puedeCrear}
          puedeAnular={acceso.puedeAnular}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Registrar novedades del REPS (apertura o cierre de servicios y sedes) está disponible en el plan Pro.</p>
      )}
    </div>
  );
}
